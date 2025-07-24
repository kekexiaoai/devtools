package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/kevinburke/ssh_config"
	"github.com/wailsapp/wails/v2/pkg/runtime"

	"devtools/internal/config"
	"devtools/internal/syncer"
	"devtools/internal/types"
)

// App struct
type App struct {
	ctx           context.Context
	configManager *config.ConfigManager
	watcherSvc    *syncer.WatcherService
	isQuitting    bool // 内部状态标志
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts.
func (a *App) startup(ctx context.Context) {
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
			fmt.Printf("运行模式: debug=%t, 日志文件路径: %s\n", IsDebug, logFilePath)
			// 将日志输出重定向到文件
			// 在开发模式下，我们希望日志同时输出到终端和文件
			// 在生产模式下，只输出到文件
			if IsDebug {
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

	// 初始化并启动文件监控服务
	a.watcherSvc = syncer.NewWatcherService(a.ctx)
	go a.watcherSvc.Start()
}

// shutdown is called when the app terminates.
func (a *App) shutdown(ctx context.Context) {
	// 优雅地关闭文件监控服务
	if a.watcherSvc != nil {
		a.watcherSvc.Stop()
	}
}

func (b *App) beforeClose(_ context.Context) (prevent bool) {
	selection, err := runtime.MessageDialog(b.ctx, runtime.MessageDialogOptions{
		Title:         "Quit?",
		Message:       "Are you sure you want to quit?",
		Buttons:       []string{"Yes", "No"},
		DefaultButton: "Yes",
		CancelButton:  "No",
	})
	if err != nil {
		return false
	}

	return selection != "Yes"
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

// 停止监控配置的所有目录
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
	// 我们可以从 entry 中获取时间戳，或者如果前端没有提供，我们自己生成一个
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

// GetSSHHosts 解析用户的 ~/.ssh/config 文件并返回所有主机配置
func (a *App) GetSSHHosts() ([]types.SSHHost, error) {
	// 获取用户的主目录
	homeDir, err := os.UserHomeDir()
	if err != nil {
		log.Printf("Error getting user home directory: %v", err)
		return nil, fmt.Errorf("could not find user home directory")
	}

	// 构建 .ssh/config 文件的完整路径
	sshConfigPath := filepath.Join(homeDir, ".ssh", "config")

	// 打开文件
	f, err := os.Open(sshConfigPath)
	if err != nil {
		// 如果文件不存在，这不是一个错误，只是说明用户没有配置。返回一个空列表。
		if os.IsNotExist(err) {
			log.Println("SSH config file does not exist, returning empty list.")
			return []types.SSHHost{}, nil
		}
		log.Printf("Error opening ssh config file: %v", err)
		return nil, fmt.Errorf("failed to open ssh config file: %w", err)
	}
	defer f.Close()

	// 使用库来解析文件
	cfg, err := ssh_config.Decode(f)
	if err != nil {
		log.Printf("Error decoding ssh config file: %v", err)
		return nil, fmt.Errorf("failed to parse ssh config file: %w", err)
	}

	// 6. 将解析出的数据转换为我们自己的 SshHost 结构体
	var hosts []types.SSHHost
	for _, host := range cfg.Hosts {
		// 我们只关心有明确别名（非通配符 '*'）的配置
		if len(host.Patterns) > 0 && host.Patterns[0].String() != "*" {
			// Handle cfg.Get return values
			hostName, _ := cfg.Get(host.Patterns[0].String(), "HostName")
			user, _ := cfg.Get(host.Patterns[0].String(), "User")
			port, _ := cfg.Get(host.Patterns[0].String(), "Port")
			identityFile, _ := cfg.Get(host.Patterns[0].String(), "IdentityFile")

			newHost := types.SSHHost{
				Alias:        host.Patterns[0].String(),
				HostName:     hostName,
				User:         user,
				Port:         port,
				IdentityFile: identityFile,
			}
			hosts = append(hosts, newHost)
		}
	}

	log.Printf("Successfully parsed %d SSH hosts.", len(hosts))
	return hosts, nil
}
