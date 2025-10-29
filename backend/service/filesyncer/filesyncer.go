package filesyncer

import (
	"context"
	"fmt"
	"log"
	"time"

	"devtools/backend/internal/syncconfig"
	"devtools/backend/internal/syncer"
	"devtools/backend/internal/types"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// Service 结构体封装了一个特定功能领域的所有依赖和逻辑。
// 它就像一个高度专业化的部门经理。
type Service struct {
	ctx           context.Context
	configManager *syncconfig.ConfigManager
	watcherSvc    *syncer.WatcherService
}

// NewService 是 FileSyncer 服务的构造函数。
// 它只设置不依赖于应用上下文的依赖项。
func NewService(cfgManager *syncconfig.ConfigManager) *Service {
	return &Service{
		// ctx 和 watcherSvc 将在 Startup 中初始化
		configManager: cfgManager,
	}
}

// Startup 在应用启动时被调用。它接收应用上下文并可以启动后台任务。
func (s *Service) Startup(ctx context.Context) error {
	s.ctx = ctx
	// 初始化并启动文件监控服务
	s.watcherSvc = syncer.NewWatcherService(s.ctx)
	go s.watcherSvc.Start()

	// --- 应用启动时自动恢复上次激活的监控 ---
	go func() {
		time.Sleep(2 * time.Second) // 稍微延迟，确保前端已准备好接收日志
		activeIDs := s.configManager.GetActiveWatcherIDs()
		for _, id := range activeIDs {
			s.emitLog("INFO", fmt.Sprintf("Auto-resuming watcher for config ID: %s", id))
			_ = s.StartWatching(id)
		}
	}()
	return nil
}

// Shutdown 负责在应用退出时，优雅地关闭此服务拥有的资源
func (s *Service) Shutdown() {
	if s.watcherSvc != nil {
		s.watcherSvc.Stop()
	}
}

// --- 配置管理方法 ---

func (s *Service) GetConfigs() ([]types.SSHConfig, error) {
	return s.configManager.GetAllSSHConfigs(), nil
}

func (s *Service) SaveConfig(config types.SSHConfig) error {
	return s.configManager.SaveSSHConfig(config)
}

func (s *Service) DeleteConfig(configID string) error {
	// 在删除配置前，停止对其的监控
	if err := s.StopWatching(configID); err != nil {
		log.Printf("Warning: failed to stop watching config %s before deletion: %v", configID, err)
	}
	return s.configManager.DeleteSSHConfig(configID)
}

// --- 同步对管理方法 ---

func (s *Service) GetSyncPairs(configID string) ([]types.SyncPair, error) {
	return s.configManager.GetSyncPairsByConfigID(configID), nil
}

func (s *Service) SaveSyncPair(pair types.SyncPair) error {
	return s.configManager.SaveSyncPair(pair)
}

func (s *Service) DeleteSyncPair(pairID string) error {
	return s.configManager.DeleteSyncPair(pairID)
}

// --- 核心功能方法 ---

func (s *Service) TestConnection(config types.SSHConfig) (string, error) {
	return syncer.TestSSHConnection(config)
}

func (s *Service) UpdateRemoteFileFromClipboard(configID string, remotePath string, content string, asHTML bool) error {
	cfg, found := s.configManager.GetSSHConfigByID(configID)
	if !found {
		return &syncconfig.ConfigNotFoundError{ConfigID: configID}
	}
	return syncer.UpdateRemoteFile(cfg, remotePath, content, asHTML)
}

// --- 监控控制方法 ---

func (s *Service) StartWatching(configID string) error {
	log.Printf("FileSyncer Service: Received request to start watching config ID: %s", configID)

	s.configManager.AddActiveWatcher(configID)

	cfg, found := s.configManager.GetSSHConfigByID(configID)
	if !found {
		return &syncconfig.ConfigNotFoundError{ConfigID: configID}
	}
	pairs := s.configManager.GetSyncPairsByConfigID(configID)

	for _, pair := range pairs {
		go func(p types.SyncPair, c types.SSHConfig) {
			client, err := syncer.NewSFTPClient(c)
			if err != nil {
				s.emitLog("ERROR", fmt.Sprintf("Initial sync failed for %s, could not connect: %v", p.LocalPath, err))
				return
			}
			defer client.Close()
			syncer.ReconcileDirectory(client, p, s.emitLog)
		}(pair, cfg)
	}
	for _, pair := range pairs {
		log.Printf("Info: Start to watch %s", pair.LocalPath)
		if err := s.watcherSvc.AddWatch(pair, cfg); err != nil {
			log.Printf("Error: Failed to watch %s -> %v", pair.LocalPath, err)
		}
	}
	return nil
}

func (s *Service) StopWatching(configID string) error {
	// --- 从持久化存储中移除 ID ---
	s.configManager.RemoveActiveWatcher(configID)
	// ---

	pairs := s.configManager.GetSyncPairsByConfigID(configID)
	for _, pair := range pairs {
		s.watcherSvc.RemoveWatch(pair)
	}
	log.Printf("FileSyncer Service: Stopped watching config: %s", configID)
	return nil
}

// --- 暴露给前端的方法，用于在启动时获取状态 ---
func (s *Service) GetActiveWatcherIDs() []string {
	return s.configManager.GetActiveWatcherIDs()
}

// --- 日志和对话框 (这些是应用级的辅助函数，但与FileSyncer紧密相关) ---

func (s *Service) emitLog(level, message string) {
	entry := types.LogEntry{
		Timestamp: time.Now().Format("15:04:05"),
		Level:     level,
		Message:   message,
	}
	runtime.EventsEmit(s.ctx, "log_event", entry)
}

// SelectFile 和 SelectDirectory 依然是 App 的职责，因为它们是通用的 Runtime 调用
