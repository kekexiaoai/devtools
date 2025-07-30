package backend

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"

	"devtools/backend/internal/config"
	"devtools/backend/internal/sshmanager"
	"devtools/backend/internal/sshtunnel"
	"devtools/backend/internal/syncer"
	"devtools/backend/internal/types"
)

// App struct
type App struct {
	ctx           context.Context
	configManager *config.ConfigManager
	watcherSvc    *syncer.WatcherService
	sshManager    *sshmanager.Manager
	tunnelManager *sshtunnel.Manager
	isQuitting    bool // 内部状态标志
	isDebug       bool
	isMacOS       bool
}

// NewApp creates a new App application struct
func NewApp(isDebug, isMacOS bool) *App {
	return &App{
		isDebug: isDebug,
		isMacOS: isMacOS,
	}
}

func (a *App) Ctx() context.Context {
	return a.ctx
}

func (a *App) IsDebug() bool {
	return a.isDebug
}

func (a *App) IsQuitting() bool {
	return a.isQuitting
}

// Startup is called when the app starts.
func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
	a.isQuitting = false // 初始化状态

	// 初始化配置管理器
	userConfigDir, err := os.UserConfigDir()
	if err != nil {
		log.Fatalf("无法获取用户配置目录: %v", err)
	}
	// --- 日志文件初始化 ---
	logDir := filepath.Join(userConfigDir, "DevTools") // 日志和配置放同一个目录
	if err := os.MkdirAll(logDir, 0o750); err != nil {
		// 如果创建目录失败，也别让程序崩溃，只是打印出来
		log.Printf("警告: 创建日志目录失败: %v", err)
	} else {
		logFilePath := filepath.Join(logDir, "app.log")
		// O_CREATE: 如果文件不存在则创建
		// O_WRONLY: 以只写模式打开
		// O_APPEND: 在文件末尾追加内容
		logFile, err := os.OpenFile(logFilePath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o660)
		if err != nil {
			log.Printf("警告: 打开日志文件失败: %v", err)
		} else {
			fmt.Printf("运行模式: debug=%t, 日志文件路径: %s\n", a.isDebug, logFilePath)
			// 将日志输出重定向到文件
			// 在开发模式下，我们希望日志同时输出到终端和文件
			// 在生产模式下，只输出到文件
			if a.isDebug {
				// 同时写入文件和标准错误输出(即终端)
				mw := io.MultiWriter(os.Stderr, logFile)
				log.SetOutput(mw)
			} else {
				log.SetOutput(logFile)
			}
		}
	}
	log.Println("-------------------- App Starting --------------------")

	configPath := filepath.Join(userConfigDir, "DevTools", "config.json")
	a.configManager = config.NewConfigManager(configPath)
	if err := a.configManager.Load(); err != nil {
		log.Printf("警告: 加载配置文件失败 (可能是首次运行): %v", err)
	}

	a.sshManager, err = sshmanager.NewManager("")
	if err != nil {
		log.Printf("警告: 初始化 SSH 配置管理器失败: %v", err)
	}

	a.tunnelManager = sshtunnel.NewManager(a.ctx, a.sshManager)

	// 初始化并启动文件监控服务
	a.watcherSvc = syncer.NewWatcherService(a.ctx)
	go a.watcherSvc.Start()
}

// Shutdown is called when the app terminates.
func (a *App) Shutdown(ctx context.Context) {
	log.Println("app shutdown")
	// 优雅地关闭文件监控服务
	if a.watcherSvc != nil {
		a.watcherSvc.Stop()
	}
}

// OnBeforeClose is called when the user attempts to close the window.
func (a *App) OnBeforeClose(ctx context.Context) (prevent bool) {
	// 这个逻辑只在 macOS 上生效
	if !a.isMacOS {
		return false // 在 Windows/Linux 上，总是允许直接退出
	}

	// 检查通行令牌
	if a.isQuitting {
		// 如果是 ForceQuit 发起的，直接允许退出
		return false
	}

	// 否则，是用户点击 'X'，发送事件并阻止退出
	runtime.EventsEmit(ctx, "app:request-quit")
	return true
}

func (a *App) Menu(appMenu *menu.Menu) {
	fileMenu := appMenu.AddSubmenu("File")
	if a.isMacOS {
		// macOS 的标准退出选项
		fileMenu.AddText("Quit DevTools", keys.CmdOrCtrl("q"), func(_ *menu.CallbackData) {
			runtime.Quit(a.ctx)
		})
	} else {
		// Windows/Linux 的标准退出选项
		fileMenu.AddText("Exit", keys.OptionOrAlt("f4"), func(_ *menu.CallbackData) {
			runtime.Quit(a.ctx)
		})
	}
	// 创建 "View" (视图) 子菜单来处理缩放
	viewMenu := appMenu.AddSubmenu("View")

	var zoomInAccelerator, zoomOutAccelerator, resetZoomAccelerator *keys.Accelerator
	var zoomInLabel, zoomOutLabel, resetZoomLabel string

	if a.isMacOS {
		// 在 macOS 上，使用标准的 +/- 快捷键，标签会自动生成
		zoomInAccelerator = keys.CmdOrCtrl("+")
		zoomOutAccelerator = keys.CmdOrCtrl("-")
		resetZoomAccelerator = keys.CmdOrCtrl("0")
		zoomInLabel = "Zoom In"
		zoomOutLabel = "Zoom Out"
		resetZoomLabel = "Actual Size"
	} else {
		// 在 Windows/Linux 上，使用不会冲突的 [ 和 ] 快捷键
		zoomInAccelerator = keys.CmdOrCtrl("]")
		zoomOutAccelerator = keys.CmdOrCtrl("[")
		resetZoomAccelerator = keys.CmdOrCtrl("0")
		// 并且我们手动在标签中加入快捷键提示
		// \t 是一个制表符，它会自动将后面的文本推到右侧对齐
		zoomInLabel = "Zoom In\tCtrl+]"
		zoomOutLabel = "Zoom Out\tCtrl+["
		resetZoomLabel = "Actual Size\tCtrl+0"
	}

	// 为 "Zoom Out" (缩小) 添加菜单项和快捷键
	viewMenu.AddText(zoomOutLabel, zoomOutAccelerator, func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "zoom_change", "small")
	})

	// 为 "Zoom In" (放大) 添加菜单项和快捷键
	viewMenu.AddText(zoomInLabel, zoomInAccelerator, func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "zoom_change", "large")
	})

	// 为 "Actual Size" (重置) 添加菜单项和快捷键
	viewMenu.AddText(resetZoomLabel, resetZoomAccelerator, func(_ *menu.CallbackData) {
		runtime.EventsEmit(a.ctx, "zoom_change", "default")
	})
}

// --- 配置管理方法 ---

func (a *App) GetConfigs() ([]types.SSHConfig, error) {
	return a.configManager.GetAllSSHConfigs(), nil
}

func (a *App) SaveConfig(config types.SSHConfig) error {
	return a.configManager.SaveSSHConfig(config)
}

func (a *App) DeleteConfig(configID string) error {
	// 在删除配置前，停止对其的监控
	a.StopWatching(configID)
	return a.configManager.DeleteSSHConfig(configID)
}

// --- 同步对管理方法 ---

func (a *App) GetSyncPairs(configID string) ([]types.SyncPair, error) {
	return a.configManager.GetSyncPairsByConfigID(configID), nil
}

func (a *App) SaveSyncPair(pair types.SyncPair) error {
	return a.configManager.SaveSyncPair(pair)
}

func (a *App) DeleteSyncPair(pairID string) error {
	// 在删除同步对之前，可能需要停止单独的监控（如果设计如此）
	// 为简化，我们目前在停止整个配置时处理
	return a.configManager.DeleteSyncPair(pairID)
}

// --- 核心功能方法 ---

func (a *App) TestConnection(config types.SSHConfig) (string, error) {
	return syncer.TestSSHConnection(config)
}

func (a *App) UpdateRemoteFileFromClipboard(configID string, remotePath string, content string, asHTML bool) error {
	cfg, found := a.configManager.GetSSHConfigByID(configID)
	if !found {
		err := &config.ConfigNotFoundError{ConfigID: configID}
		log.Printf("update remote file from clipboard failed: %s", err)

		return err
	}
	// 将 asHTML 参数传递给底层的 syncer 函数
	err := syncer.UpdateRemoteFile(cfg, remotePath, content, asHTML)
	if err != nil {
		message := fmt.Sprintf("update remote file [%s] from clipboard failed: %s", remotePath, err)
		a.emitLog("ERROR", message)
		log.Print(message)
		return err
	}
	message := fmt.Sprintf("update remote file [%s] from clipboard succeeded", remotePath)
	a.emitLog("SUCCESS", message)
	return nil
}

// --- 监控控制方法 ---

func (a *App) StartWatching(configID string) error {
	log.Printf("BACKEND: Received request to start watching config ID: %s", configID)

	cfg, found := a.configManager.GetSSHConfigByID(configID)
	if !found {
		return &config.ConfigNotFoundError{ConfigID: configID}
	}
	pairs := a.configManager.GetSyncPairsByConfigID(configID)

	// 为每个同步目录对，在后台启动一次“对账”任务
	for _, pair := range pairs {
		go func(p types.SyncPair, c types.SSHConfig) {
			// 建立连接
			client, err := syncer.NewSFTPClient(c)
			if err != nil {
				a.emitLog("ERROR", fmt.Sprintf("Initial sync failed for %s, could not connect: %v", p.LocalPath, err))
				return
			}
			defer client.Close()

			// 执行对账
			syncer.ReconcileDirectory(client, p, a.emitLog)
		}(pair, cfg)
	}
	// 开始监控配置的所有目录
	for _, pair := range pairs {
		if err := a.watcherSvc.AddWatch(pair, cfg); err != nil {
			log.Printf("错误：无法监控 %s -> %v", pair.LocalPath, err)
			// 继续尝试监控其他目录
		}
	}
	log.Printf("开始监控配置: %s (%s)", cfg.Name, cfg.ID)
	return nil
}

// StopWatching 停止监控配置的所有目录
func (a *App) StopWatching(configID string) error {
	pairs := a.configManager.GetSyncPairsByConfigID(configID)
	for _, pair := range pairs {
		a.watcherSvc.RemoveWatch(pair)
	}
	log.Printf("停止监控配置: %s", configID)
	return nil
}

// SelectFile 处理文件选择
func (a *App) SelectFile(title string) (string, error) {
	options := runtime.OpenDialogOptions{
		Title: title,
		// 您可以在这里添加文件过滤器
		// Filters: []runtime.FileFilter{
		// 	{
		// 		DisplayName: "Key Files (*.pem, id_rsa*)",
		// 		Pattern:     "*.pem;id_rsa*",
		// 	},
		// },
	}

	// 调用 Go runtime 的 OpenFileDialog 函数
	return runtime.OpenFileDialog(a.ctx, options)
}

// SelectDirectory 处理文件夹选择
func (a *App) SelectDirectory(title string) (string, error) {
	options := runtime.OpenDialogOptions{
		Title:                title,
		CanCreateDirectories: true, // 允许用户在对话框中创建新文件夹
	}
	// 调用 Go runtime 的 OpenDirectoryDialog 函数
	return runtime.OpenDirectoryDialog(a.ctx, options)
}

// ShowInfoDialog 显示一个原生的信息对话框
func (a *App) ShowInfoDialog(title string, message string) {
	runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
		Type:    runtime.InfoDialog,
		Title:   title,
		Message: message,
	})
}

// ShowErrorDialog 显示一个原生的错误对话框
func (a *App) ShowErrorDialog(title string, message string) {
	runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
		Type:    runtime.ErrorDialog,
		Title:   title,
		Message: message,
	})
}

// ShowConfirmDialog 显示一个原生的确认对话框，并返回用户的选择
func (a *App) ShowConfirmDialog(title string, message string) (string, error) {
	return runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
		Type:          runtime.QuestionDialog,
		Title:         title,
		Message:       message,
		Buttons:       []string{"Yes", "No"},
		DefaultButton: "No",
		CancelButton:  "No",
	})
}

// LogFromFrontend 接收一个结构化的 LogEntry 对象
func (a *App) LogFromFrontend(entry types.LogEntry) {
	// 我们可以从 entry 中获取时间戳，或者如果前端没有提供， ourselves generate one
	timestamp := entry.Timestamp
	if timestamp == "" {
		timestamp = time.Now().Format("15:04:05")
	}

	// 使用我们已经配置好的、会写入到文件的 log 包
	log.Printf("[FRONTEND] [%s] [%s] %s", timestamp, entry.Level, entry.Message)
}

// 定义一个日志发送函数传递给对账函数
func (a *App) emitLog(level, message string) {
	entry := types.LogEntry{
		Timestamp: time.Now().Format("15:04:05"),
		Level:     level,
		Message:   message,
	}
	runtime.EventsEmit(a.ctx, "log_event", entry)
}

// ForceQuit 强制退出应用程序
func (a *App) ForceQuit() {
	log.Println("ForceQuit called from frontend. Setting quit flag and exiting.")
	// 在调用 Quit 之前，先设置状态标志
	a.isQuitting = true
	runtime.Quit(a.ctx)
}

// / GetSSHHosts 调用 internal/sshconfig 的实现
func (a *App) GetSSHHosts() ([]types.SSHHost, error) {
	// 直接调用内部管理器的方法
	hosts, err := a.sshManager.GetSSHHosts()
	if err != nil {
		// 可以在这里添加应用层的日志记录
		log.Printf("App: Error getting SSH hosts: %v", err)
		return nil, err // 错误已经被内部封装过了
	}
	log.Printf("App: Successfully retrieved %d SSH hosts.", len(hosts))
	return hosts, nil
}

// // ConnectInTerminal 调用 internal/sshconfig 的实现
// func (a *App) ConnectInTerminal(alias string) error {
// 	// 直接调用内部管理器的方法
// 	err := a.sshManager.ConnectInTerminal(alias)
// 	if err != nil {
// 		// 可以在这里添加应用层的日志记录
// 		log.Printf("App: Error connecting to %s: %v", alias, err)
// 		return err // 错误已经被内部封装过了
// 	}
// 	return nil
// }

// SaveSSHHost 保存（新增或更新）一个 SSH 主机配置
func (a *App) SaveSSHHost(host types.SSHHost) error {
	// 我们的 sshmanager 期望的是一个包含所有参数的 map
	// 我们需要将 types.SSHHost 转换为它需要的格式
	params := make(map[string]string)
	params["HostName"] = host.HostName
	params["User"] = host.User
	params["Port"] = host.Port
	params["IdentityFile"] = host.IdentityFile

	updateReq := sshmanager.HostUpdateRequest{
		Name:   host.Alias,
		Params: params,
	}

	// 检查是新增还是更新
	if a.sshManager.HasHost(host.Alias) {
		return a.sshManager.UpdateHost(updateReq)
	}
	return a.sshManager.AddHostWithParams(updateReq)
}

// DeleteSSHHost 删除一个 SSH 主机配置
func (a *App) DeleteSSHHost(alias string) error {
	return a.sshManager.DeleteHost(alias)
}

// ReloadSSHHosts 重新从文件加载所有 SSH 主机
func (a *App) ReloadSSHHosts() error {
	return a.sshManager.Reload()
}

// GetSSHConfigFileContent 获取SSH配置文件的原始内容
func (a *App) GetSSHConfigFileContent() (string, error) {
	return a.sshManager.GetRawContent()
}

// SaveSSHConfigFileContent 保存SSH配置文件的原始内容
func (a *App) SaveSSHConfigFileContent(content string) error {
	return a.sshManager.SaveRawContent(content)
}

// StopForward 停止一个正在运行的隧道
func (a *App) StopForward(tunnelID string) error {
	return a.tunnelManager.StopForward(tunnelID)
}

// GetActiveTunnels 获取当前活动的隧道列表
func (a *App) GetActiveTunnels() []sshtunnel.ActiveTunnelInfo {
	return a.tunnelManager.GetActiveTunnels()
}

// SavePasswordForAlias 将主机的密码安全地存储到系统钥匙串中
func (a *App) SavePasswordForAlias(alias string, password string) error {
	return a.sshManager.SavePasswordForAlias(alias, password)
}

// DeletePasswordForAlias 当用户删除主机配置时，也从钥匙串中删除密码
func (a *App) DeletePasswordForAlias(alias string) error {
	return a.sshManager.DeletePasswordForAlias(alias)
}

// StartTunnelWithPassword 接收前端提供的密码来完成隧道创建
// 注意：我们将原有的 StartLocalForward 函数签名进行扩展
func (a *App) StartLocalForward(alias string, localPort int, remoteHost string, remotePort int, password string, savePassword bool) (string, error) {
	// 如果用户选择保存密码，则先保存
	if savePassword && password != "" {
		if err := a.SavePasswordForAlias(alias, password); err != nil {
			// 记录警告，但继续尝试连接
			log.Printf("Warning: failed to save password to keychain for host %s: %v", alias, err)
		}
	}
	return a.tunnelManager.StartLocalForward(alias, localPort, remoteHost, remotePort, password)
}

// ConnectInTerminal 尝试无密码连接
func (a *App) ConnectInTerminal(alias string) error {
	// 先尝试不带密码获取配置（即使用密钥或钥匙串）
	authConfig, err := a.sshManager.GetConnectionConfig(alias, "", false)
	if err != nil {
		// 如果返回需要密码的错误，则将该错误原封不动地传递给前端
		if _, ok := err.(*types.PasswordRequiredError); ok {
			return err
		}
		// 其他错误则正常报告
		return fmt.Errorf("failed to get connection config: %w", err)
	}

	// 如果成功获取配置，则调用执行函数
	return a.sshManager.ConnectInTerminalWithConfig(alias, authConfig, a.isDebug)
}

// ConnectInTerminalWithPassword 接收密码来完成连接
func (a *App) ConnectInTerminalWithPassword(alias string, password string, savePassword bool) error {
	// 如果用户选择保存密码，则先保存
	if savePassword && password != "" {
		log.Printf("Info: saving password to keychain for host %s", alias)
		if err := a.sshManager.SavePasswordForAlias(alias, password); err != nil {
			log.Printf("Warning: failed to save password to keychain for host %s: %v", alias, err)
		}
	}

	// 使用用户提供的密码来获取配置
	log.Printf("Info: get connection config for host %s with password", alias)
	authConfig, err := a.sshManager.GetConnectionConfig(alias, password, false)
	if err != nil {
		return fmt.Errorf("failed to get connection config even with password: %w", err)
	}

	runtime.EventsEmit(a.ctx, "ssh:status", map[string]any{
		"alias":   alias,
		"status":  "testing",
		"message": fmt.Sprintf("testing to %s...", alias),
	})
	// 密码有效性测试
	log.Printf("Info: testing SSH connection with provided password for %s", alias)
	sshAddr := fmt.Sprintf("%s:%s", authConfig.HostName, authConfig.Port)
	testClient, dialErr := ssh.Dial("tcp", sshAddr, authConfig.ClientConfig)
	if dialErr != nil {
		runtime.EventsEmit(a.ctx, "ssh:status", map[string]any{
			"alias":   alias,
			"status":  "failed",
			"message": fmt.Sprintf("testing to %s failed: %s", alias, dialErr),
		})
		// 识别常见认证错误（适配不同SSH服务器的错误提示）
		authErrorKeywords := []string{
			"unable to authenticate",
			"permission denied",
			"invalid password",
			"publickey denied",
			"authentication failed",
		}
		for _, keyword := range authErrorKeywords {
			if strings.Contains(strings.ToLower(dialErr.Error()), strings.ToLower(keyword)) {
				return fmt.Errorf("invalid password for host %s", alias)
			}
		}
		return fmt.Errorf("failed to connect to %s: %w", sshAddr, dialErr)
	}
	testClient.Close() // 关闭测试连接
	log.Printf("Info: password validation succeeded for host %s", alias)
	// 密码测试结束

	runtime.EventsEmit(a.ctx, "ssh:status", map[string]any{
		"alias":   alias,
		"status":  "connecting",
		"message": fmt.Sprintf("Connecting to %s...", alias),
	})
	// 调用执行函数
	log.Printf("Info: connect in terminal for host %s with password", alias)
	err = a.sshManager.ConnectInTerminalWithConfig(alias, authConfig, a.isDebug) // 新增debug参数
	if err != nil {
		// 发送"连接中"事件
		runtime.EventsEmit(a.ctx, "ssh:status", map[string]any{
			"alias":   alias,
			"status":  "failed",
			"message": fmt.Sprintf("Connecting to %s failed: %s", alias, err),
		})

		return fmt.Errorf("failed to connect in terminal with password: %w", err)
	}

	// 发送"连接成功"事件
	runtime.EventsEmit(a.ctx, "ssh:status", map[string]any{
		"alias":   alias,
		"status":  "success",
		"message": fmt.Sprintf("Terminal opened for %s", alias),
	})

	return nil
}

// 辅助函数，用于处理连接错误
func (a *App) handleSSHConnectError(alias string, err error) error {
	// 检查是否是需要密码的错误
	if _, ok := err.(*types.PasswordRequiredError); ok {
		return err // 原样返回给前端
	}
	// 检查是否是主机密钥验证错误（需要提取远程主机密钥）
	var keyErr *knownhosts.KeyError
	if errors.As(err, &keyErr) {
		// 这是一个新的或已更改的主机密钥，我们需要去捕获它
		log.Printf("Host key error for %s, attempting to capture new key...", alias)

		remoteKey, captureErr := a.sshManager.CaptureHostKey(alias)
		if captureErr != nil {
			return fmt.Errorf("failed to capture remote host key: %w", captureErr)
		}
		
		host, err := a.sshManager.GetSSHHostByAlias(alias)
		if err != nil {
		return fmt.Errorf("failed to get ssh host %q: %w", alias, err)
		}
		hostAddress := fmt.Sprintf("%s:%s", host.HostName, host.Port)

		return &types.HostKeyVerificationRequiredError{
			Alias:       alias,
			Fingerprint: ssh.FingerprintSHA256(remoteKey),
			HostAddress: hostAddress,
		}
	}

	// 其他通用错误
	return fmt.Errorf("connection failed: %w", err)
}

// ConnectInTerminalAndTrustHost 用户确认后，接受主机指纹并连接
func (a *App) ConnectInTerminalAndTrustHost(alias string, password string, savePassword bool) error {
	// 1. 先将新的主机密钥添加到 known_hosts 文件
	host, err := a.sshManager.GetSSHHostByAlias(alias)
	if err != nil {
		return err
	}
	remoteKey, err := a.sshManager.CaptureHostKey(alias)
	if err != nil {
		return err
	}
	if err := a.sshManager.AddHostKeyToKnownHosts(host, remoteKey); err != nil {
		log.Printf("Warning: failed to add host key to known_hosts: %v", err)
	}
	
	// 2. 然后再用正常的方式连接（此时 known_hosts 检查会通过）
	// 注意：这里可能依然需要密码
	_, err = a.sshManager.GetConnectionConfig(alias, password, false)
	if err != nil {
		return a.handleSSHConnectError(alias, err)
	}
	return a.sshManager.ConnectInTerminal(alias)
}