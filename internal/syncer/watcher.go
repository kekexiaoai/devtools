package syncer

import (
	"context"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/fsnotify/fsnotify"

	"DevTools/internal/config"
)

type WatcherService struct {
	ctx           context.Context
	cancel        context.CancelFunc
	watcher       *fsnotify.Watcher
	watchedItems  map[string]config.SyncPair  // key: localPath
	watchedConfig map[string]config.SSHConfig // key: localPath
	mu            sync.RWMutex
}

func NewWatcherService(appCtx context.Context) *WatcherService {
	// 创建一个可以被取消的子context
	ctx, cancel := context.WithCancel(appCtx)
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Fatalf("无法创建文件监控器: %v", err)
	}

	return &WatcherService{
		ctx:           ctx,
		cancel:        cancel,
		watcher:       watcher,
		watchedItems:  make(map[string]config.SyncPair),
		watchedConfig: make(map[string]config.SSHConfig),
	}
}

func (s *WatcherService) Start() {
	defer s.watcher.Close()
	log.Println("文件监控服务已启动")

	for {
		select {
		case <-s.ctx.Done():
			log.Println("文件监控服务正在关闭...")
			return
		case event, ok := <-s.watcher.Events:
			if !ok {
				return
			}
			s.handleEvent(event)
		case err, ok := <-s.watcher.Errors:
			if !ok {
				return
			}
			log.Printf("监控错误: %v", err)
		}
	}
}

func (s *WatcherService) Stop() {
	s.cancel()
}

func (s *WatcherService) AddWatch(pair config.SyncPair, config config.SSHConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	err := s.watcher.Add(pair.LocalPath)
	if err != nil {
		return err
	}
	s.watchedItems[pair.LocalPath] = pair
	s.watchedConfig[pair.LocalPath] = config
	log.Printf("添加监控: %s", pair.LocalPath)
	return nil
}

func (s *WatcherService) RemoveWatch(pair config.SyncPair) {
	s.mu.Lock()
	defer s.mu.Unlock()

	err := s.watcher.Remove(pair.LocalPath)
	if err != nil {
		log.Printf("移除监控失败: %v", err)
	}
	delete(s.watchedItems, pair.LocalPath)
	delete(s.watchedConfig, pair.LocalPath)
	log.Printf("移除监控: %s", pair.LocalPath)
}

func (s *WatcherService) handleEvent(event fsnotify.Event) {
	s.mu.RLock()
	// 找到哪个被监控的根目录触发了事件
	var basePath string
	var pair config.SyncPair
	var config config.SSHConfig
	found := false
	for path := range s.watchedItems {
		if strings.HasPrefix(event.Name, path) {
			basePath = path
			pair = s.watchedItems[path]
			config = s.watchedConfig[path]
			found = true
			break
		}
	}
	s.mu.RUnlock()

	if !found {
		// log.Printf("收到未知路径的事件: %s", event.Name)
		return
	}

	// 计算相对路径
	relativePath, err := filepath.Rel(basePath, event.Name)
	if err != nil {
		log.Printf("计算相对路径失败: %v", err)
		return
	}
	// 在远程路径中使用'/'作为分隔符
	remotePath := filepath.ToSlash(filepath.Join(pair.RemotePath, relativePath))

	// 获取sftp客户端
	client, err := newSFTPClient(config)
	if err != nil {
		log.Printf("无法连接到 %s 以处理事件: %v", config.Host, err)
		return
	}
	defer client.Close()

	// 处理事件类型
	if event.Has(fsnotify.Create) || event.Has(fsnotify.Write) {
		// 检查路径是文件还是目录
		info, err := os.Stat(event.Name)
		if err != nil {
			if os.IsNotExist(err) {
				// 文件可能在写入后立刻被删除，忽略
				return
			}
			log.Printf("无法获取文件信息 %s: %v", event.Name, err)
			return
		}
		if info.IsDir() {
			// 如果是目录创建，只需在远程创建对应目录即可
			if err := client.MkdirAll(remotePath); err != nil {
				log.Printf("远程目录创建失败: %v", err)
			}
			log.Printf("CREATED DIR: %s -> %s", event.Name, remotePath)
		} else {
			// 如果是文件，则同步
			if err := syncFile(client, event.Name, remotePath); err != nil {
				log.Printf("文件同步失败: %v", err)
			}
		}
	} else if event.Has(fsnotify.Remove) {
		if pair.SyncDeletes {
			if err := deleteRemote(client, remotePath); err != nil {
				log.Printf("远程删除失败: %v", err)
			}
		}
	} else if event.Has(fsnotify.Rename) {
		// 重命名被fsnotify视为旧名称的Remove事件
		// 新名称会触发一个Create事件，所以我们在这里处理删除
		if pair.SyncDeletes {
			if err := deleteRemote(client, remotePath); err != nil {
				log.Printf("重命名导致的远程删除失败: %v", err)
			}
		}
	}
}
