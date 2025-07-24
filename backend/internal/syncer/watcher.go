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

	"devtools/backend/internal/types"

	"github.com/fsnotify/fsnotify"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// WatcherService 负责所有文件监控的逻辑
type WatcherService struct {
	ctx           context.Context
	cancel        context.CancelFunc
	watcher       *fsnotify.Watcher
	watchedItems  map[string][]types.SyncPair
	watchedConfig map[string]types.SSHConfig
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
		watchedItems:  make(map[string][]types.SyncPair),
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

	// 只有当这个路径是第一次被添加时，才真正地添加到 fsnotify 的监控中
	if _, ok := s.watchedItems[pair.LocalPath]; !ok {
		err := s.watcher.Add(pair.LocalPath)
		if err != nil {
			return err
		}
		log.Printf("添加新监控路径: %s", pair.LocalPath)
	}

	// 将新的同步对追加到对应路径的切片中
	s.watchedItems[pair.LocalPath] = append(s.watchedItems[pair.LocalPath], pair)
	s.watchedConfig[pair.LocalPath] = cfg // SSH 配置可以覆盖，因为它们对于同一个本地路径总是相同的

	log.Printf("已配置同步对: %s -> %s", pair.LocalPath, pair.RemotePath)
	return nil
}

// RemoveWatch 移除一个正在监控的目录
func (s *WatcherService) RemoveWatch(pairToRemove types.SyncPair) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// 找到对应本地路径的同步对列表
	pairs, ok := s.watchedItems[pairToRemove.LocalPath]
	if !ok {
		return // 如果这个路径本来就没在监控，直接返回
	}

	// 从列表中移除指定的同步对 (通过其唯一ID)
	newPairs := make([]types.SyncPair, 0)
	for _, p := range pairs {
		if p.ID != pairToRemove.ID {
			newPairs = append(newPairs, p)
		}
	}

	// 如果移除后列表为空，则从 fsnotify 中彻底移除对该路径的监控
	if len(newPairs) == 0 {
		err := s.watcher.Remove(pairToRemove.LocalPath)
		if err != nil {
			log.Printf("从 fsnotify 移除监控失败: %v", err)
		}
		delete(s.watchedItems, pairToRemove.LocalPath)
		delete(s.watchedConfig, pairToRemove.LocalPath)
		log.Printf("已移除对路径 %s 的所有监控", pairToRemove.LocalPath)
	} else {
		// 否则，只是更新列表
		s.watchedItems[pairToRemove.LocalPath] = newPairs
		log.Printf("已移除同步对: %s -> %s", pairToRemove.LocalPath, pairToRemove.RemotePath)
	}
}

// handleEvent 是处理所有文件系统事件的核心函数
func (s *WatcherService) handleEvent(event fsnotify.Event) {
	s.mu.RLock()

	var bestMatchPath string = ""
	for path := range s.watchedItems {
		if strings.HasPrefix(event.Name, path) {
			if len(path) > len(bestMatchPath) {
				bestMatchPath = path
			}
		}
	}

	if bestMatchPath == "" {
		s.mu.RUnlock()
		return
	}

	// 获取与最佳匹配路径对应的所有同步对和SSH配置
	pairsToSync := s.watchedItems[bestMatchPath]
	config := s.watchedConfig[bestMatchPath]
	s.mu.RUnlock()

	// 为每一个匹配的同步对都执行一次同步操作
	for _, pair := range pairsToSync {
		// 在 goroutine 中执行每个同步任务，避免互相阻塞
		go func(p types.SyncPair, c types.SSHConfig) {
			emitLog := func(level, message string) {
				entry := types.LogEntry{Timestamp: time.Now().Format("15:04:05"), Level: level, Message: message}
				runtime.EventsEmit(s.ctx, "log_event", entry)
			}

			relativePath, err := filepath.Rel(bestMatchPath, event.Name)
			if err != nil {
				emitLog("ERROR", fmt.Sprintf("Cannot calculate relative path: %v", err))
				return
			}
			remotePath := filepath.ToSlash(filepath.Join(p.RemotePath, relativePath))

			client, err := NewSFTPClient(c)
			if err != nil {
				emitLog("ERROR", fmt.Sprintf("Cannot connect to %s for %s: %v", c.Host, remotePath, err))
				return
			}
			defer client.Close()

			// 根据事件类型执行不同操作，并使用新的日志格式
			if event.Has(fsnotify.Create) || event.Has(fsnotify.Write) {
				info, err := os.Stat(event.Name)
				if err != nil {
					if os.IsNotExist(err) {
						return
					}
					emitLog("ERROR", fmt.Sprintf("Cannot get file info for %s: %v", event.Name, err))
					return
				}
				if info.IsDir() {
					if err := client.MkdirAll(remotePath); err != nil {
						emitLog("ERROR", fmt.Sprintf("Failed to create remote dir %s: %v", remotePath, err))
					} else {
						emitLog("INFO", fmt.Sprintf("Created Dir: %s -> %s", event.Name, remotePath))
					}
				} else {
					if err := syncFile(client, event.Name, remotePath); err != nil {
						emitLog("ERROR", fmt.Sprintf("Failed to sync: %s -> %s (%v)", event.Name, remotePath, err))
					} else {
						emitLog("SUCCESS", fmt.Sprintf("Synced: %s -> %s", event.Name, remotePath))
					}
				}
			} else if event.Has(fsnotify.Remove) || event.Has(fsnotify.Rename) {
				if pair.SyncDeletes {
					if err := deleteRemote(client, remotePath); err != nil {
						emitLog("ERROR", fmt.Sprintf("Failed to delete remote %s: %v", remotePath, err))
					} else {
						emitLog("SUCCESS", fmt.Sprintf("Deleted: %s -> %s", event.Name, remotePath))
					}
				}
			}
		}(pair, config)
	}
}
