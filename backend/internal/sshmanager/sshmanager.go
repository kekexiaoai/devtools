package sshmanager

import (
	"errors"
	"fmt"
	"log"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"devtools/backend/internal/types"
	"devtools/backend/pkg/sshconfig"

	"github.com/skeema/knownhosts"
	"github.com/zalando/go-keyring"
	"golang.org/x/crypto/ssh"
)

// 定义钥匙串服务的名称
const keyringService = "DevTools-SSH-Gate"

// ConnectionConfig 结构体，用于封装一个完整的SSH客户端配置
type ConnectionConfig struct {
	HostName     string
	Port         string
	User         string
	IdentityFile string // 添加此字段存储密钥文件路径
	ClientConfig *ssh.ClientConfig
}

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

func (m *Manager) HasHost(hostname string) bool {
	return m.manager.HasHost(hostname)
}

func (m *Manager) GetHostNames() ([]string, error) {
	return m.manager.GetHostNames()
}

// AddHostWithParams 添加一个带参数的新主机
func (m *Manager) AddHostWithParams(req HostUpdateRequest) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// 检查主机是否已存在
	if m.manager.HasHost(req.Name) {
		return fmt.Errorf("host %s already exists", req.Name)
	}

	// 添加主机
	m.manager.AddHost(req.Name)

	// 设置参数
	for key, value := range req.Params {
		// 直接使用 value，因为 req.Params 是 map[string]string
		if value == "" {
			continue
		}
		err := m.manager.SetParam(req.Name, key, value)
		if err != nil {
			return fmt.Errorf("failed to set param %s for host %s: %w", key, req.Name, err)
		}
	}

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

// GetRawContent 读取并返回配置文件的原始字符串内容
func (m *Manager) GetRawContent() (string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	data, err := os.ReadFile(m.configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil // 文件不存在，返回空字符串是正常行为
		}
		return "", fmt.Errorf("failed to read ssh config content: %w", err)
	}
	return string(data), nil
}

// SaveRawContent 校验并保存完整的配置文件内容
func (m *Manager) SaveRawContent(content string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// 在保存前，先进行一次基本的语法校验
	validator := sshconfig.NewConfigValidator(strings.Split(content, "\n"))
	if err := validator.Validate(); err != nil {
		return fmt.Errorf("SSH config validation failed: %w", err)
	}

	// 覆写文件
	if err := os.WriteFile(m.configPath, []byte(content), 0o600); err != nil {
		return fmt.Errorf("failed to write raw ssh config: %w", err)
	}
	log.Printf("SSH config file %s has been updated.", m.configPath)

	// 写回成功后，必须重新加载内存中的 manager，以保证数据同步
	return m.reload()
}

// reload 是一个内部方法，用于在不释放锁的情况下重新加载配置
func (m *Manager) reload() error {
	newManager, err := sshconfig.NewManager(m.configPath)
	if err != nil {
		return fmt.Errorf("failed to reload config from %s: %w", m.configPath, err)
	}
	m.manager = newManager
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

// convertToSSHHost 将 HostConfig 转换为 types.SSHHost
func convertToSSHHost(hostConfig *sshconfig.HostConfig) types.SSHHost {
	// 从 Params 中提取信息
	getParamValue := func(key string) string {
		if params, ok := hostConfig.Params[key]; ok && len(params) > 0 {
			// 如果有多个同名参数，通常取第一个
			return params[0].Value
		}
		return "" // 或者返回默认值，如果库或 SSH 有默认值的话
	}

	return types.SSHHost{
		Alias:        hostConfig.Name,
		HostName:     getParamValue("HostName"),
		User:         getParamValue("User"),
		Port:         getParamValue("Port"),
		IdentityFile: getParamValue("IdentityFile"),
		// 可以根据需要添加更多字段
	}
}

func (m *Manager) GetSSHHostByAlias(alias string) (*types.SSHHost, error) {
	host, err := m.GetSSHHost(alias)
	if err != nil {
		return nil, err
	}
	// 在这里，我们集中处理所有默认值逻辑
	if host.Port == "" {
		host.Port = "22"
	}
	// 未来如果还有其他默认值，也在这里添加
	return host, nil
}

func (m *Manager) GetSSHHost(alias string) (*types.SSHHost, error) {
	hostConfig, err := m.manager.GetHost(alias)
	if err != nil {
		return nil, err
	}
	newHost := convertToSSHHost(hostConfig)
	return &newHost, nil
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
		newHost := convertToSSHHost(hostConfig)
		hosts = append(hosts, newHost)
	}

	log.Printf("Successfully parsed %d SSH hosts.", len(hosts)) // 如果需要日志
	return hosts, nil
}

// a special error type to capture the host key
type captureHostKeyError struct {
	key ssh.PublicKey
}

func (e *captureHostKeyError) Error() string {
	return "host key captured"
}

// captureHostKey 是一个特殊的函数，用于捕获服务器的公钥
func (m *Manager) CaptureHostKey(host *types.SSHHost) (ssh.PublicKey, error) {
	// 创建一个只用于捕获的、不进行任何认证的配置
	captureConfig := &ssh.ClientConfig{
		User: host.User,
		// 关键：这个回调函数在拿到公钥后，会立即返回一个特殊错误来中断连接
		HostKeyCallback: func(hostname string, remote net.Addr, key ssh.PublicKey) error {
			return &captureHostKeyError{key: key}
		},
		Timeout: 5 * time.Second,
	}

	// 使用处理过的 port
	serverAddr := fmt.Sprintf("%s:%s", host.HostName, host.Port)
	client, err := ssh.Dial("tcp", serverAddr, captureConfig)
	if client != nil {
		client.Close()
	}

	// 检查返回的错误
	var capturedKeyErr *captureHostKeyError
	if errors.As(err, &capturedKeyErr) {
		// 成功捕获！返回公钥
		return capturedKeyErr.key, nil
	}

	// 其他错误
	return nil, fmt.Errorf("failed to capture host key: %w", err)
}

// AddHostKeyToKnownHosts 将一个新的主机公钥添加到用户的 known_hosts 文件中
func (m *Manager) AddHostKeyToKnownHosts(host *types.SSHHost, key ssh.PublicKey) error {
	knownHostsPath := filepath.Join(filepath.Dir(m.configPath), "known_hosts")

	// 以“追加”模式打开文件，如果文件不存在则创建
	f, err := os.OpenFile(knownHostsPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return fmt.Errorf("failed to open known_hosts file for writing: %w", err)
	}
	defer f.Close()

	// 构建要写入的地址列表
	// 一个主机别名可能对应多个地址（例如，域名和IP地址）
	// 我们在这里将主机名和端口组合起来
	addresses := []string{fmt.Sprintf("[%s]:%s", host.HostName, host.Port)}

	// 使用 knownhosts.Line() 这个标准函数来生成格式正确的行
	newLine := knownhosts.Line(addresses, key)

	// 检查文件是否为空，如果是，则不加换行符
	stat, err := f.Stat()
	if err != nil {
		return err
	}

	if stat.Size() > 0 {
		newLine = "\n" + newLine
	}

	// 将新行写入文件末尾
	if _, err := f.WriteString(newLine); err != nil {
		return fmt.Errorf("failed to write to known_hosts file: %w", err)
	}

	log.Printf("Added new host key for %s to %s", host.Alias, knownHostsPath)
	return nil
}

// readKeyFile 是一个辅助函数，用于读取密钥文件并展开'~'
func readKeyFile(path string) ([]byte, error) {
	if strings.HasPrefix(path, "~") {
		homeDir, err := os.UserHomeDir()
		if err != nil {
			return nil, err
		}
		path = filepath.Join(homeDir, path[1:])
	}
	return os.ReadFile(path)
}

// SavePassword 将密码安全地存入系统钥匙串
func (m *Manager) SavePassword(key string, password string) error {
	return keyring.Set(keyringService, key, password)
}

// DeletePassword 从系统钥匙串中删除密码
func (m *Manager) DeletePassword(key string) error {
	// 在删除前检查是否存在，避免keyring库在某些平台因找不到而报错
	_, err := keyring.Get(keyringService, key)
	if err == nil {
		return keyring.Delete(keyringService, key)
	}
	return nil // 如果本来就不存在，也算成功
}

// _getAuthMethods 智能地构建认证方法列表
func (m *Manager) _getAuthMethods(host *types.SSHHost, password string, keychainKey string) ([]ssh.AuthMethod, error) {
	var authMethods []ssh.AuthMethod

	// 认证优先级 1: 用户本次在UI上输入的临时密码
	if password != "" {
		authMethods = append(authMethods, ssh.Password(password))
	}

	// 认证优先级 2: 从系统钥匙串中获取已保存的密码
	// The keychainKey can be either a host alias or a tunnel ID.
	if keychainKey != "" {
		savedPassword, err := keyring.Get(keyringService, keychainKey)
		if err == nil && savedPassword != "" {
			authMethods = append(authMethods, ssh.Password(savedPassword))
		}
	}

	// 认证优先级 3: ~/.ssh/config 中配置的 IdentityFile (密钥文件)
	if host.IdentityFile != "" {
		key, err := readKeyFile(host.IdentityFile)
		if err == nil {
			signer, err := ssh.ParsePrivateKey(key)
			if err == nil {
				authMethods = append(authMethods, ssh.PublicKeys(signer))
			} else {
				log.Printf("Warning: Failed to parse private key %s: %v", host.IdentityFile, err)
			}
		} else {
			log.Printf("Warning: Failed to read private key file %s: %v", host.IdentityFile, err)
		}
	}

	// 如果一个有效的认证方法都没有，就返回需要密码的特定错误
	if len(authMethods) == 0 {
		return nil, &types.PasswordRequiredError{Alias: host.Alias}
	}

	return authMethods, nil
}

// VerifyConnection 执行一次真正的连接“预检”
func (m *Manager) VerifyConnection(alias string, password string) (*types.SSHHost, error) {
	config, host, err := m.GetConnectionConfig(alias, password)
	if err != nil {
		return host, err
	}

	// 尝试真正地拨号连接
	serverAddr := fmt.Sprintf("%s:%s", config.HostName, config.Port)
	client, err := ssh.Dial("tcp", serverAddr, config.ClientConfig)
	if err != nil {

		dialErrStr := strings.ToLower(err.Error())
		// 检查是否是因为没有可用的认证方法
		if strings.Contains(dialErrStr, "no supported methods remain") {
			// 这种情况明确意味着我们需要一个凭据
			return host, &types.PasswordRequiredError{Alias: alias}
		}

		// 检查是否是常见的认证失败错误
		authErrorKeywords := []string{
			"unable to authenticate",
			"permission denied",
			"invalid password",
			"publickey denied",
			"authentication failed",
			// Add more keywords as needed from different SSH server implementations
		}
		for _, keyword := range authErrorKeywords {
			if strings.Contains(dialErrStr, keyword) {
				// 如果是认证失败，我们返回一个更具体的、对用户友好的错误信息
				// 这会覆盖掉底层的 HostKeyVerificationRequiredError 或 PasswordRequiredError
				// 因为“密码或密钥错误”是更精确的原因

				// 如果是认证失败，并且我们确实尝试了至少一种认证方法
				// (GetConnectionConfig 返回的 ClientConfig.Auth 不为空)，
				// 那么我们就返回一个“认证失败”的特定错误。
				if len(config.ClientConfig.Auth) > 0 {
					return host, &types.AuthenticationFailedError{Alias: alias}
				}
				// todo 确认是否需要返回下面的错误
				return host, fmt.Errorf("authentication failed: please check your password or key file")
			}
		}

		// 如果不是认证失败，再返回原始的拨号错误（可能是需要密码，或需要主机验证）
		return host, err
	}
	// 如果连接成功，立即关闭。我们只是为了检查，不需要保持连接。
	client.Close()

	// 连接成功，没有错误
	return host, nil
}

// BuildSSHClientConfig builds a complete SSH client configuration from a host object and a password.
// This is the core logic, decoupled from ~/.ssh/config aliases.
func (m *Manager) BuildSSHClientConfig(host *types.SSHHost, password string, keychainKey string) (*ConnectionConfig, error) {
	authMethods, err := m._getAuthMethods(host, password, keychainKey)
	if err != nil {
		return nil, err
	}

	var hostKeyCallback ssh.HostKeyCallback

	knownHostsPath := filepath.Join(filepath.Dir(m.configPath), "known_hosts")
	var hkcb knownhosts.HostKeyCallback
	hkcb, err = knownhosts.New(knownHostsPath)
	if err != nil {
		return nil, fmt.Errorf("could not create known_hosts callback: %w", err)
	}
	hostKeyCallback = hkcb.HostKeyCallback()

	clientConfig := &ssh.ClientConfig{
		User:            host.User,
		Auth:            authMethods,
		HostKeyCallback: hostKeyCallback,
		Timeout:         10 * time.Second,
	}

	return &ConnectionConfig{
		HostName:     host.HostName,
		Port:         host.Port,
		User:         host.User,
		IdentityFile: host.IdentityFile,
		ClientConfig: clientConfig,
	}, nil
}

// GetConnectionConfig retrieves an SSH connection configuration based on a host alias from ~/.ssh/config.
func (m *Manager) GetConnectionConfig(alias string, password string) (*ConnectionConfig, *types.SSHHost, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	host, err := m.GetSSHHostByAlias(alias)
	if err != nil {
		return nil, nil, err
	}

	connConfig, err := m.BuildSSHClientConfig(host, password, host.Alias)
	if err != nil {
		// The host object is still useful for the caller (e.g., for error handling UI)
		return nil, host, err
	}

	return connConfig, host, nil
}

func sshExec(sshCmd string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		// macOS 的命令
		script := fmt.Sprintf(`tell app "Terminal" to do script "%s"`, sshCmd)
		cmd = exec.Command("osascript", "-e", script)
	case "windows":
		// Windows 的命令
		// start 命令会打开一个新的终端窗口
		cmd = exec.Command("cmd.exe", "/c", "start", "wt.exe", sshCmd)
	default: // Linux
		cmd = exec.Command("gnome-terminal", "--", "bash", "-c", sshCmd+"; exec bash")
	}

	// Start() 启动命令，不等待它完成
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start terminal command: %w", err)
	}
	return nil
}

// ConnectInTerminal 在系统默认终端中打开一个 SSH 连接
func (m *Manager) ConnectInTerminal(alias string, dryRun bool) error {
	if dryRun {
		return nil
	}
	// ssh 客户端非常智能，我们只需要告诉它要连接的别名 (alias) 即可。
	// 它会自动从 ~/.ssh/config 文件中读取 HostName, User, Port, IdentityFile 等所有配置。
	sshCmd := fmt.Sprintf("ssh %s", alias)
	log.Printf("Debug: SSH command to be executed: %s", sshCmd)

	return sshExec(sshCmd)
}

// ConnectInTerminalWithConfig 接收一个完整的配置，并在系统终端中打开连接
func (m *Manager) ConnectInTerminalWithConfig(alias string, config *ConnectionConfig) error {
	// 处理密钥文件路径（展开~并验证）
	identityFile := config.IdentityFile
	if identityFile != "" {
		// 展开路径中的~符号
		if strings.HasPrefix(identityFile, "~") {
			homeDir, err := os.UserHomeDir()
			if err != nil {
				return fmt.Errorf("failed to resolve home directory: %w", err)
			}
			identityFile = filepath.Join(homeDir, identityFile[1:])
		}
		// 验证文件是否存在
		if _, err := os.Stat(identityFile); err != nil {
			log.Printf("Warning: Identity file %s not found", identityFile)
			identityFile = "" // 文件不存在时不使用该参数
		}
	}

	// 构建SSH命令参数（动态拼接，避免硬编码）
	sshArgs := []string{
		"-p", config.Port, // 端口参数
		"-F", "/dev/null", // 忽略系统默认配置
		"-o", "IdentitiesOnly=yes", // 仅使用指定的身份验证方式
	}

	// 仅当密钥文件有效时添加-i参数
	if identityFile != "" {
		sshArgs = append(sshArgs, "-i", identityFile)
	}

	// 添加目标用户@主机
	sshArgs = append(sshArgs, fmt.Sprintf("%s@%s", config.User, config.HostName))

	// 拼接完整命令字符串
	sshCmd := "ssh " + strings.Join(sshArgs, " ")

	log.Printf("Debug: SSH command to be executed: %s", sshCmd)

	return sshExec(sshCmd)
}
