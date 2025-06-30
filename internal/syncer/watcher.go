package syncer

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"devtools/internal/types"

	"github.com/fsnotify/fsnotify"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// WatcherService 负责所有文件监控的逻辑
type WatcherService struct {
	ctx           context.Context
	cancel        context.CancelFunc
	watcher       *fsnotify.Watcher
	watchedItems  map[string]types.SyncPair  // key: localPath
	watchedConfig map[string]types.SSHConfig // key: localPath
	mu            sync.RWMutex
}

// NewWatcherService 是 WatcherService 的构造函数
func NewWatcherService(appCtx context.Context) *WatcherService {
	// 创建一个可以被取消的子 context，用于优雅地关闭 goroutine
	ctx, cancel := context.WithCancel(appCtx)

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		// 在真实应用中，这里可能需要更优雅的错误处理，而不是直接 panic
		log.Fatalf("无法创建文件监控器: %v", err)
	}

	return &WatcherService{
		ctx:           ctx,
		cancel:        cancel,
		watcher:       watcher,
		watchedItems:  make(map[string]types.SyncPair),
		watchedConfig: make(map[string]types.SSHConfig),
	}
}

// Start 在一个新的 goroutine 中启动监控服务的主循环
func (s *WatcherService) Start() {
	defer s.watcher.Close()
	log.Println("文件监控服务已启动")

	for {
		select {
		// 如果 context 被取消 (通过调用 s.Stop())，则退出循环
		case <-s.ctx.Done():
			log.Println("文件监控服务正在关闭...")
			return
		// 处理文件系统事件
		case event, ok := <-s.watcher.Events:
			if !ok {
				return
			}
			go s.handleEvent(event) // 在新的goroutine中处理事件，避免阻塞主循环
		// 处理监控器自身的错误
		case err, ok := <-s.watcher.Errors:
			if !ok {
				return
			}
			log.Printf("监控器错误: %v", err)
		}
	}
}

// Stop 优雅地停止监控服务
func (s *WatcherService) Stop() {
	s.cancel()
}

// AddWatch 添加一个要监控的目录
func (s *WatcherService) AddWatch(pair types.SyncPair, cfg types.SSHConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	err := s.watcher.Add(pair.LocalPath)
	if err != nil {
		return err
	}
	s.watchedItems[pair.LocalPath] = pair
	s.watchedConfig[pair.LocalPath] = cfg
	log.Printf("添加监控: %s", pair.LocalPath)
	return nil
}

// RemoveWatch 移除一个正在监控的目录
func (s *WatcherService) RemoveWatch(pair types.SyncPair) {
	s.mu.Lock()
	defer s.mu.Unlock()

	err := s.watcher.Remove(pair.LocalPath)
	if err != nil {
		// 即便移除失败，也清理map，以防状态不一致
		log.Printf("从 fsnotify 移除监控失败: %v", err)
	}
	delete(s.watchedItems, pair.LocalPath)
	delete(s.watchedConfig, pair.LocalPath)
	log.Printf("移除监控: %s", pair.LocalPath)
}

// handleEvent 是处理所有文件系统事件的核心函数
func (s *WatcherService) handleEvent(event fsnotify.Event) {
	s.mu.RLock()
	// 找到哪个被监控的根目录触发了事件
	var basePath string
	var pair types.SyncPair
	var cfg types.SSHConfig
	found := false
	for path := range s.watchedItems {
		if strings.HasPrefix(event.Name, path) {
			basePath = path
			pair = s.watchedItems[path]
			cfg = s.watchedConfig[path]
			found = true
			break
		}
	}
	s.mu.RUnlock()

	if !found {
		return // 收到未知路径的事件，忽略
	}

	// 定义一个辅助函数来向前端发送日志
	emitLog := func(level, message string) {
		entry := types.LogEntry{
			Timestamp: time.Now().Format("15:04:05"),
			Level:     level,
			Message:   message,
		}
		runtime.EventsEmit(s.ctx, "log_event", entry)
	}

	// 计算相对路径和最终的远程路径
	relativePath, err := filepath.Rel(basePath, event.Name)
	if err != nil {
		emitLog("ERROR", fmt.Sprintf("无法计算相对路径: %v", err))
		return
	}
	remotePath := filepath.ToSlash(filepath.Join(pair.RemotePath, relativePath))

	// 获取sftp客户端
	client, err := NewSFTPClient(cfg)
	if err != nil {
		emitLog("ERROR", fmt.Sprintf("无法连接到 %s: %v", cfg.Host, err))
		return
	}
	defer client.Close()

	// 根据事件类型执行不同操作
	if event.Has(fsnotify.Create) || event.Has(fsnotify.Write) {
		info, err := os.Stat(event.Name)
		if err != nil {
			if os.IsNotExist(err) {
				return
			} // 文件可能在写入后立刻被删除
			emitLog("ERROR", fmt.Sprintf("无法获取文件信息 %s: %v", event.Name, err))
			return
		}
		if info.IsDir() {
			if err := client.MkdirAll(remotePath); err != nil {
				emitLog("ERROR", fmt.Sprintf("远程目录创建失败 %s: %v", remotePath, err))
			} else {
				emitLog("INFO", fmt.Sprintf("Created Dir: %s", remotePath))
			}
		} else {
			if err := syncFile(client, event.Name, remotePath); err != nil {
				emitLog("ERROR", fmt.Sprintf("同步文件失败 %s: %v", event.Name, err))
			} else {
				emitLog("SUCCESS", fmt.Sprintf("Synced: %s", event.Name))
			}
		}
	} else if event.Has(fsnotify.Remove) || event.Has(fsnotify.Rename) {
		// Rename事件在很多系统上被视为对旧名的Remove，所以合并处理
		if pair.SyncDeletes {
			if err := deleteRemote(client, remotePath); err != nil {
				emitLog("ERROR", fmt.Sprintf("远程删除失败 %s: %v", remotePath, err))
			} else {
				emitLog("SUCCESS", fmt.Sprintf("Deleted: %s", remotePath))
			}
		}
	}
}
