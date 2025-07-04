package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/google/uuid"

	"devtools/internal/types"
)

type AppConfig struct {
	SSHConfigs []types.SSHConfig `json:"sshConfigs"`
	SyncPairs  []types.SyncPair  `json:"syncPairs"`
}

// --- 错误类型 ---
type ConfigNotFoundError struct {
	ConfigID string
}

func (e *ConfigNotFoundError) Error() string {
	return fmt.Sprintf("未找到ID为 '%s' 的配置", e.ConfigID)
}

// --- 配置管理器 ---

type ConfigManager struct {
	path   string
	config AppConfig
	mu     sync.RWMutex
}

func NewConfigManager(path string) *ConfigManager {
	return &ConfigManager{
		path: path,
		config: AppConfig{
			SSHConfigs: make([]types.SSHConfig, 0),
			SyncPairs:  make([]types.SyncPair, 0),
		},
	}
}

func (cm *ConfigManager) Load() error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	data, err := os.ReadFile(cm.path)
	if err != nil {
		if os.IsNotExist(err) {
			// 文件不存在是正常情况，返回nil
			return nil
		}
		return err
	}
	return json.Unmarshal(data, &cm.config)
}

func (cm *ConfigManager) save() error {
	data, err := json.MarshalIndent(cm.config, "", "  ")
	if err != nil {
		return err
	}
	// 确保目录存在
	dir := filepath.Dir(cm.path)
	if err := os.MkdirAll(dir, 0750); err != nil {
		return err
	}
	return os.WriteFile(cm.path, data, 0640)
}

func (cm *ConfigManager) GetAllSSHConfigs() []types.SSHConfig {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	return cm.config.SSHConfigs
}

func (cm *ConfigManager) GetSSHConfigByID(id string) (types.SSHConfig, bool) {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	for _, c := range cm.config.SSHConfigs {
		if c.ID == id {
			return c, true
		}
	}
	return types.SSHConfig{}, false
}

func (cm *ConfigManager) SaveSSHConfig(config types.SSHConfig) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	if config.ID == "" {
		config.ID = uuid.NewString()
		cm.config.SSHConfigs = append(cm.config.SSHConfigs, config)
	} else {
		found := false
		for i, c := range cm.config.SSHConfigs {
			if c.ID == config.ID {
				cm.config.SSHConfigs[i] = config
				found = true
				break
			}
		}
		if !found {
			return &ConfigNotFoundError{ConfigID: config.ID}
		}
	}
	return cm.save()
}

func (cm *ConfigManager) DeleteSSHConfig(id string) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	newConfigs := make([]types.SSHConfig, 0)
	found := false
	for _, c := range cm.config.SSHConfigs {
		if c.ID == id {
			found = true
			continue
		}
		newConfigs = append(newConfigs, c)
	}

	if !found {
		return &ConfigNotFoundError{ConfigID: id}
	}
	cm.config.SSHConfigs = newConfigs
	// 同时删除关联的同步对
	newPairs := make([]types.SyncPair, 0)
	for _, p := range cm.config.SyncPairs {
		if p.ConfigID != id {
			newPairs = append(newPairs, p)
		}
	}
	cm.config.SyncPairs = newPairs

	return cm.save()
}

func (cm *ConfigManager) GetSyncPairsByConfigID(configID string) []types.SyncPair {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	pairs := make([]types.SyncPair, 0)
	for _, p := range cm.config.SyncPairs {
		if p.ConfigID == configID {
			pairs = append(pairs, p)
		}
	}
	return pairs
}

func (cm *ConfigManager) SaveSyncPair(pair types.SyncPair) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	if pair.ID == "" {
		pair.ID = uuid.NewString()
		cm.config.SyncPairs = append(cm.config.SyncPairs, pair)
	} else {
		found := false
		for i, p := range cm.config.SyncPairs {
			if p.ID == pair.ID {
				cm.config.SyncPairs[i] = pair
				found = true
				break
			}
		}
		if !found {
			return fmt.Errorf("未找到ID为 '%s' 的同步对", pair.ID)
		}
	}
	return cm.save()
}

func (cm *ConfigManager) DeleteSyncPair(id string) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	newPairs := make([]types.SyncPair, 0)
	found := false
	for _, p := range cm.config.SyncPairs {
		if p.ID == id {
			found = true
			continue
		}
		newPairs = append(newPairs, p)
	}
	if !found {
		return fmt.Errorf("未找到ID为 '%s' 的同步对", id)
	}
	cm.config.SyncPairs = newPairs
	return cm.save()
}
