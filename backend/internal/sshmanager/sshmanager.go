package sshmanager

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"

	"devtools/backend/internal/types"
	"devtools/backend/pkg/sshconfig"
)

// Manager 封装了对 SSH 配置的高级操作
type Manager struct {
	// 使用一个指针，方便重新加载
	manager *sshconfig.SSHConfigManager
	// 保护 manager 的并发访问
	mu sync.RWMutex
	// 配置文件路径
	configPath string
}

// ConfigSnapshot 代表一个配置快照，用于返回配置信息，避免直接暴露内部结构
type ConfigSnapshot struct {
	RawLines    []string
	HostConfigs []*HostConfigSnapshot
	Includes    []string
}

// HostConfigSnapshot 代表单个主机的配置快照
type HostConfigSnapshot struct {
	Name        string
	IsGlobal    bool
	Description string
	Params      map[string][]string // 简化参数表示，只取值
}

// HostUpdateRequest 定义更新主机配置的请求
type HostUpdateRequest struct {
	Name   string            `json:"name"`
	Params map[string]string `json:"params"` // key -> new value, empty value means remove
}

// NewManager 创建一个新的应用层 Manager
// configPath 是 SSH 配置文件的路径，如果为空，则使用默认路径 ~/.ssh/config
func NewManager(configPath string) (*Manager, error) {
	if configPath == "" {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return nil, fmt.Errorf("failed to get home dir: %w", err)
		}
	
		configPath = filepath.Join(homeDir, ".ssh", "config")
	}

	// 使用 pkg 层创建基础管理器
	manager, err := sshconfig.NewManager(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to create pkg manager: %w", err)
	}

	return &Manager{
		manager:    manager,
		configPath: configPath,
	}, nil
}

// GetConfigSnapshot 获取当前配置的快照
func (m *Manager) GetConfigSnapshot() (*ConfigSnapshot, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	// 获取所有主机配置
	hostConfigs, err := m.manager.GetAllHosts()
	if err != nil {
		return nil, fmt.Errorf("failed to get all hosts: %w", err)
	}

	// 转换为主机快照
	var snapshots []*HostConfigSnapshot
	for _, hostConfig := range hostConfigs {
		snapshot := &HostConfigSnapshot{
			Name:        hostConfig.Name,
			IsGlobal:    hostConfig.IsGlobal,
			Description: hostConfig.Description,
			Params:      make(map[string][]string),
		}
		for key, params := range hostConfig.Params {
			var values []string
			for _, param := range params {
				values = append(values, param.Value)
			}
			snapshot.Params[key] = values
		}
		snapshots = append(snapshots, snapshot)
	}

	// 获取 Include 指令
	includes := m.manager.GetIncludes()

	return &ConfigSnapshot{
		RawLines:    m.manager.GetRawLines(), // GetRawLines 返回副本，安全
		HostConfigs: snapshots,
		Includes:    includes,
	}, nil
}

// GetHostParams 获取指定主机的所有参数 (key -> value 列表)
func (m *Manager) GetHostParams(hostname string) (map[string][]string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	hostConfig, err := m.manager.GetHost(hostname)
	if err != nil {
		return nil, fmt.Errorf("failed to get host %s: %w", hostname, err)
	}

	params := make(map[string][]string)
	for key, paramList := range hostConfig.Params {
		var values []string
		for _, param := range paramList {
			values = append(values, param.Value)
		}
		params[key] = values
	}
	return params, nil
}

// UpdateHost 批量更新或删除主机参数
// 如果 req.Params 中某个 key 的 value 为空字符串，则删除该参数
func (m *Manager) UpdateHost(req HostUpdateRequest) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	hostname := req.Name
	for key, value := range req.Params {
		var err error
		if value == "" {
			// 删除参数
			err = m.manager.RemoveParam(hostname, key)
			if err != nil {
				// 如果参数不存在，RemoveParam 可能会返回错误，这里可以视情况处理
				// 为了简化，我们记录警告而不是失败整个操作
				// log.Printf("Warning: Failed to remove param %s for host %s: %v", key, hostname, err)
				// 或者严格处理：
				// return fmt.Errorf("failed to remove param %s for host %s: %w", key, hostname, err)
			}
		} else {
			// 设置/更新参数
			err = m.manager.SetParam(hostname, key, value)
		}
		if err != nil {
			return fmt.Errorf("failed to process param %s for host %s: %w", key, hostname, err)
		}
	}

	// 保存更改
	if err := m.manager.Save(); err != nil {
		return fmt.Errorf("failed to save config after update: %w", err)
	}

	return nil
}

// AddHost 添加一个新主机
func (m *Manager) AddHost(hostname string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// 检查主机是否已存在
	if m.manager.HasHost(hostname) {
		return fmt.Errorf("host %s already exists", hostname)
	}

	// 添加主机（pkg 层会自动保存到内存）
	m.manager.AddHost(hostname)

	// 保存到文件
	if err := m.manager.Save(); err != nil {
		return fmt.Errorf("failed to save config after adding host: %w", err)
	}

	return nil
}

// DeleteHost 删除一个主机
func (m *Manager) DeleteHost(hostname string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// 检查主机是否存在
	if !m.manager.HasHost(hostname) {
		return fmt.Errorf("host %s not found", hostname)
	}

	// 删除主机
	if err := m.manager.RemoveHost(hostname); err != nil {
		return fmt.Errorf("failed to remove host %s: %w", hostname, err)
	}

	// 保存更改
	if err := m.manager.Save(); err != nil {
		return fmt.Errorf("failed to save config after deleting host: %w", err)
	}

	return nil
}

// Reload 重新加载配置文件
func (m *Manager) Reload() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	newManager, err := sshconfig.NewManager(m.configPath)
	if err != nil {
		return fmt.Errorf("failed to reload config from %s: %w", m.configPath, err)
	}

	m.manager = newManager
	return nil
}

// Validate 检查配置文件语法
func (m *Manager) Validate() error {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if err := m.manager.Validate(); err != nil {
		return fmt.Errorf("config validation failed: %w", err)
	}
	return nil
}

// Backup 创建配置文件备份
func (m *Manager) Backup() (string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	backupPath, err := m.manager.Backup()
	if err != nil {
		return "", fmt.Errorf("failed to create backup: %w", err)
	}
	return backupPath, nil
}

// GetGlobalParams 获取全局配置 (Host *) 的参数
func (m *Manager) GetGlobalParams() (map[string][]string, error) {
	return m.GetHostParams("*")
}

// UpdateGlobal 批量更新全局配置参数
func (m *Manager) UpdateGlobal(params map[string]string) error {
	req := HostUpdateRequest{
		Name:   "*",
		Params: params,
	}
	return m.UpdateHost(req)
}

// GetSSHHosts 解析用户的 SSH 配置文件并返回所有主机配置
func (m *Manager) GetSSHHosts() ([]types.SSHHost, error) {
	// 使用内部的 GetAllHosts 方法获取所有主机配置
	hostConfigs, err := m.manager.GetAllHosts()
	if err != nil {
		return nil, fmt.Errorf("failed to get hosts from manager: %w", err)
	}

	hosts := make([]types.SSHHost, 0)
	for _, hostConfig := range hostConfigs {
		// 只关心有明确别名（非通配符 '*'）的配置
		// 注意：你的新库中，全局配置 Host * 的 IsGlobal 字段为 true
		if hostConfig.Name == "*" || hostConfig.IsGlobal {
			continue
		}

		// 从 Params 中提取信息
		getParamValue := func(key string) string {
			if params, ok := hostConfig.Params[key]; ok && len(params) > 0 {
				// 如果有多个同名参数，通常取第一个
				return params[0].Value
			}
			return "" // 或者返回默认值，如果库或 SSH 有默认值的话
		}

		newHost := types.SSHHost{
			Alias:        hostConfig.Name,
			HostName:     getParamValue("HostName"),
			User:         getParamValue("User"),
			Port:         getParamValue("Port"),
			IdentityFile: getParamValue("IdentityFile"),
			// 可以根据需要添加更多字段
		}
		hosts = append(hosts, newHost)
	}

	log.Printf("Successfully parsed %d SSH hosts.", len(hosts)) // 如果需要日志
	return hosts, nil
}

// ConnectInTerminal 在系统默认终端中打开一个 SSH 连接
func (m *Manager) ConnectInTerminal(alias string) error {
	// 注意：这个函数本身不需要使用 m.manager 的配置数据，
	// 它依赖 SSH 客户端去读取配置文件。
	// 但是，它现在是 Manager 的方法，可以访问 m.configPath (如果需要的话)。

	var cmd *exec.Cmd
	switch runtime.GOOS { // 使用标准库 runtime
	case "darwin":
		// macOS 的命令
		script := fmt.Sprintf(`tell app "Terminal" to do script "ssh %s"`, alias)
		cmd = exec.Command("osascript", "-e", script)
	case "windows":
		// Windows 的命令
		// 注意：这里的 sshConfigPath 可能不需要，因为 ssh 客户端通常会查找默认位置。
		// 如果你需要强制指定，可以从 m.configPath 获取，但通常 alias 就足够了。
		// 保持原逻辑不变，或者简化为直接使用 alias
		// sshCmd := fmt.Sprintf("ssh -F %s %s", m.configPath, alias) // 如果需要指定文件
		sshCmd := fmt.Sprintf("ssh %s", alias) // 更常见
		cmd = exec.Command("cmd.exe", "/c", "start", "wt.exe", "cmd.exe", "/k", sshCmd)
	default:
		// Linux 的通用命令
		cmd = exec.Command("gnome-terminal", "--", "ssh", alias)
		// 注意：不同的 Linux 发行版和桌面环境可能需要不同的命令
		// 例如，对于 KDE 可能是 konsole，对于 xfce 可能是 xfce4-terminal
		// 一个更健壮的方法是检测终端类型或提供配置选项。
		// 简单起见，这里保持原样。
	}

	// cmd.Start() 启动命令，不等待它完成，这符合在终端中启动新会话的预期。
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start terminal command: %w", err)
	}
	return nil
}
