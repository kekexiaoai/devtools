package main

import (
	"context"
	"log"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"DevTools/internal/config"
	"DevTools/internal/syncer"
)

// App struct
type App struct {
	ctx           context.Context
	configManager *config.ConfigManager
	watcherSvc    *syncer.WatcherService
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// 初始化配置管理器
	userConfigDir, err := os.UserConfigDir()
	if err != nil {
		log.Fatalf("无法获取用户配置目录: %v", err)
	}
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

// --- 配置管理方法 ---

func (a *App) GetConfigs() ([]config.SSHConfig, error) {
	return a.configManager.GetAllSSHConfigs(), nil
}

func (a *App) SaveConfig(config config.SSHConfig) error {
	return a.configManager.SaveSSHConfig(config)
}

func (a *App) DeleteConfig(configID string) error {
	// 在删除配置前，停止对其的监控
	a.StopWatching(configID)
	return a.configManager.DeleteSSHConfig(configID)
}

// --- 同步对管理方法 ---

func (a *App) GetSyncPairs(configID string) ([]config.SyncPair, error) {
	return a.configManager.GetSyncPairsByConfigID(configID), nil
}

func (a *App) SaveSyncPair(pair config.SyncPair) error {
	return a.configManager.SaveSyncPair(pair)
}

func (a *App) DeleteSyncPair(pairID string) error {
	// 在删除同步对之前，可能需要停止单独的监控（如果设计如此）
	// 为简化，我们目前在停止整个配置时处理
	return a.configManager.DeleteSyncPair(pairID)
}

// --- 核心功能方法 ---

func (a *App) TestConnection(config config.SSHConfig) (string, error) {
	return syncer.TestSSHConnection(config)
}

func (a *App) UpdateRemoteFileFromClipboard(configID string, remotePath string, content string) error {
	cfg, found := a.configManager.GetSSHConfigByID(configID)
	if !found {
		return &config.ConfigNotFoundError{ConfigID: configID}
	}
	return syncer.UpdateRemoteFile(cfg, remotePath, content)
}

// --- 监控控制方法 ---

func (a *App) StartWatching(configID string) error {
	cfg, found := a.configManager.GetSSHConfigByID(configID)
	if !found {
		return &config.ConfigNotFoundError{ConfigID: configID}
	}
	pairs := a.configManager.GetSyncPairsByConfigID(configID)
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
