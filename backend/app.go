package backend

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/runtime"

	"devtools/backend/internal/sshmanager"
	"devtools/backend/internal/syncconfig"
	"devtools/backend/internal/types"
	"devtools/backend/service/filesyncer"
	"devtools/backend/service/sshgate"
	"devtools/backend/service/terminal"
)

// App struct
type App struct {
	ctx context.Context

	// 服务层
	SSHGateService  *sshgate.Service
	TerminalService *terminal.Service
	FileSyncService *filesyncer.Service

	isQuitting bool // 内部状态标志
	isDebug    bool
	isMacOS    bool
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

// bootstrap 负责在 Wails 启动前，创建和组装所有应用的核心服务
func (a *App) Bootstrap() {
	// 日志初始化
	logDir := a.initLogger()

	// 初始化基础管理器
	configPath := filepath.Join(logDir, "config.json")
	cfgManager := syncconfig.NewConfigManager(configPath)
	if err := cfgManager.Load(); err != nil {
		log.Printf("Warning: Failed to load config file: %v", err)
	}

	sshMgr, err := sshmanager.NewManager("")
	if err != nil {
		log.Fatalf("关键错误: 初始化 SSH 配置管理器失败: %v", err)
	}

	// 创建并注入服务实例到 app 中
	a.FileSyncService = filesyncer.NewService(cfgManager)
	a.SSHGateService = sshgate.NewService(sshMgr)
	a.TerminalService = terminal.NewService(sshMgr)
}

func (a *App) initLogger() string {
	userConfigDir, err := os.UserConfigDir()
	if err != nil {
		log.Fatalf("无法获取用户配置目录: %v", err)
	}
	logDir := filepath.Join(userConfigDir, "DevTools")

	// --- 日志文件初始化 ---
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
			if a.IsDebug() {
				// 同时写入文件和标准错误输出(即终端)
				mw := io.MultiWriter(os.Stderr, logFile)
				log.SetOutput(mw)
			} else {
				log.SetOutput(logFile)
			}
		}
	}
	return logDir
}

// Startup is called when the app starts.
func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
	a.isQuitting = false // 初始化状态

	// 定义一个启动任务列表
	startupTasks := []struct {
		Name    string
		StartFn func(context.Context) error
	}{
		{"FileSyncService", a.FileSyncService.Startup},
		{"SSHGateService", a.SSHGateService.Startup},
		{"TerminalService", a.TerminalService.Startup},
	}

	log.Println("App startup initiated...")

	// 依次启动每个服务，并在失败时处理错误
	for _, task := range startupTasks {
		log.Printf("Starting service: %s", task.Name)
		if err := task.StartFn(ctx); err != nil {
			// 记录致命错误
			log.Printf("FATAL: Failed to start service '%s': %v", task.Name, err)
			// 向用户显示一个原生错误对话框
			runtime.MessageDialog(ctx, runtime.MessageDialogOptions{
				Type:    runtime.ErrorDialog,
				Title:   "Application Startup Failed",
				Message: fmt.Sprintf("Could not start the '%s'. The application will now exit.\n\nError: %v", task.Name, err),
			})
			// 退出应用
			runtime.Quit(ctx)
			return
		}
	}

	// 所有服务启动成功，向前端发送“就绪”信号
	runtime.EventsEmit(ctx, "app:ready")
	log.Println("All backend services started successfully. App is ready.")
}

// Shutdown is called when the app terminates.
func (a *App) Shutdown(ctx context.Context) {
	log.Println("App shutdown initiated...")
	if a.FileSyncService != nil {
		a.FileSyncService.Shutdown()
	}
	if a.SSHGateService != nil {
		a.SSHGateService.Shutdown()
	}
	if a.TerminalService != nil {
		a.TerminalService.Shutdown()
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

// ForceQuit 强制退出应用程序
func (a *App) ForceQuit() {
	log.Println("ForceQuit called from frontend. Setting quit flag and exiting.")
	// 在调用 Quit 之前，先设置状态标志
	a.isQuitting = true
	runtime.Quit(a.ctx)
}
