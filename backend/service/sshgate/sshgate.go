package sshgate

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"devtools/backend/internal/sshmanager"
	"devtools/backend/internal/sshtunnel"
	"devtools/backend/internal/types"
	"devtools/backend/pkg/sshconfig"

	"github.com/google/uuid"
	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"
)

// TunnelsConfig is the root object for the tunnels JSON configuration file.
type TunnelsConfig struct {
	Tunnels []sshtunnel.SavedTunnelConfig `json:"tunnels"`
}

// Service 封装了所有与 SSH Gate 功能相关的后端逻辑
type Service struct {
	ctx           context.Context
	sshManager    *sshmanager.Manager
	tunnelManager *sshtunnel.Manager

	// --- For tunnel configuration persistence ---
	tunnelsConfigPath string
	tunnelsConfig     *TunnelsConfig
	configMu          sync.RWMutex
}

// NewService 是 SSHGate 服务的构造函数
func NewService(sshMgr *sshmanager.Manager) *Service {
	tunnelMgr := sshtunnel.NewManager(sshMgr)
	s := &Service{
		sshManager:    sshMgr,
		tunnelManager: tunnelMgr,
		tunnelsConfig: &TunnelsConfig{Tunnels: []sshtunnel.SavedTunnelConfig{}},
	}
	return s
}

// Startup 在应用启动时被调用，接收应用上下文并启动子服务。
func (s *Service) Startup(ctx context.Context) error {
	s.ctx = ctx

	// Load tunnel configurations at startup.
	if err := s.loadTunnelsConfig(); err != nil {
		log.Printf("Warning: could not load tunnel configurations: %v", err)
		// We don't return the error, as the app can still function without saved tunnels.
	}

	return s.tunnelManager.Startup(ctx)
}

func (s *Service) Shutdown() {
	s.tunnelManager.Shutdown()
}

// / GetSSHHosts 调用 internal/sshconfig 的实现
func (a *Service) GetSSHHosts() ([]types.SSHHost, error) {
	// 直接调用内部管理器的方法
	hosts, err := a.sshManager.GetSSHHosts()
	if err != nil {
		// 可以在这里添加应用层的日志记录
		log.Printf("Service: Error getting SSH hosts: %v", err)
		return nil, err // 错误已经被内部封装过了
	}
	log.Printf("Service: Successfully retrieved %d SSH hosts.", len(hosts))
	return hosts, nil
}

// validateAndSanitizeHost cleans and validates the input SSHHost.
// It trims whitespace from all fields and checks for required values and format constraints.
func validateAndSanitizeHost(host *types.SSHHost) error {
	// 1. Sanitize: Trim whitespace from all fields.
	host.Alias = strings.TrimSpace(host.Alias)
	host.HostName = strings.TrimSpace(host.HostName)
	host.User = strings.TrimSpace(host.User)
	host.Port = strings.TrimSpace(host.Port)
	host.IdentityFile = strings.TrimSpace(host.IdentityFile)

	// 2. Validate: Check for required fields using a map for clarity and easy extension.
	requiredFields := map[string]string{
		"alias":    host.Alias,
		"hostName": host.HostName,
		"user":     host.User,
	}
	for field, value := range requiredFields {
		if value == "" {
			return fmt.Errorf("%s is required", field)
		}
	}

	// 3. Specific validations
	if strings.Contains(host.Alias, " ") {
		return errors.New("alias cannot contain spaces")
	}

	return nil
}

// SaveSSHHost 保存（新增或更新）一个 SSH 主机配置
func (a *Service) SaveSSHHost(host types.SSHHost) error {
	if err := validateAndSanitizeHost(&host); err != nil {
		return err
	}

	// 我们的 sshmanager 期望的是一个包含所有参数的 map
	// 我们需要将 types.SSHHost 转换为它需要的格式
	params := make(map[string]string)
	params["HostName"] = host.HostName
	params["User"] = host.User
	params["Port"] = host.Port
	params["IdentityFile"] = host.IdentityFile

	updateReq := sshmanager.HostUpdateRequest{
		Name:   host.Alias,
		Params: params,
	}

	// 检查是新增还是更新
	if a.sshManager.HasHost(host.Alias) {
		return a.sshManager.UpdateHost(updateReq)
	}
	return a.sshManager.AddHostWithParams(updateReq)
}

// DeleteSSHHost 删除一个 SSH 主机配置
func (a *Service) DeleteSSHHost(alias string) error {
	return a.sshManager.DeleteHost(alias)
}

// ReloadSSHHosts 重新从文件加载所有 SSH 主机
func (a *Service) ReloadSSHHosts() error {
	return a.sshManager.Reload()
}

// GetSSHConfigFileContent 获取SSH配置文件的原始内容
func (a *Service) GetSSHConfigFileContent() (string, error) {
	return a.sshManager.GetRawContent()
}

// SaveSSHConfigFileContent 保存SSH配置文件的原始内容
func (a *Service) SaveSSHConfigFileContent(content string) error {
	return a.sshManager.SaveRawContent(content)
}

// --- Tunnel Configuration Management ---

// loadTunnelsConfig loads the tunnel configurations from the JSON file.
func (s *Service) loadTunnelsConfig() error {
	s.configMu.Lock()
	defer s.configMu.Unlock()

	configDir, err := os.UserConfigDir()
	if err != nil {
		return fmt.Errorf("failed to get user config directory: %w", err)
	}
	appConfigDir := filepath.Join(configDir, "DevTools") // Use your app's name
	if err := os.MkdirAll(appConfigDir, 0o755); err != nil {
		return fmt.Errorf("failed to create app config directory: %w", err)
	}
	s.tunnelsConfigPath = filepath.Join(appConfigDir, "tunnels.json")

	data, err := os.ReadFile(s.tunnelsConfigPath)
	if err != nil {
		if os.IsNotExist(err) {
			log.Println("Tunnels config file not found, will create a new one on save.")
			s.tunnelsConfig = &TunnelsConfig{Tunnels: []sshtunnel.SavedTunnelConfig{}}
			return nil
		}
		return fmt.Errorf("failed to read tunnels config file: %w", err)
	}

	if err := json.Unmarshal(data, s.tunnelsConfig); err != nil {
		return fmt.Errorf("failed to unmarshal tunnels config: %w", err)
	}

	log.Printf("Successfully loaded %d saved tunnel configurations.", len(s.tunnelsConfig.Tunnels))
	return nil
}

// saveTunnelsConfig saves the current tunnel configurations to the JSON file.
func (s *Service) saveTunnelsConfig() error {
	data, err := json.MarshalIndent(s.tunnelsConfig, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal tunnels config: %w", err)
	}

	if err := os.WriteFile(s.tunnelsConfigPath, data, 0o644); err != nil {
		return fmt.Errorf("failed to write tunnels config file: %w", err)
	}

	log.Printf("Successfully saved %d tunnel configurations to %s.", len(s.tunnelsConfig.Tunnels), s.tunnelsConfigPath)
	return nil
}

// GetSavedTunnels retrieves all saved tunnel configurations.
func (s *Service) GetSavedTunnels() ([]sshtunnel.SavedTunnelConfig, error) {
	s.configMu.RLock()
	defer s.configMu.RUnlock()

	// Return a copy to avoid race conditions if the caller modifies the slice.
	tunnels := make([]sshtunnel.SavedTunnelConfig, len(s.tunnelsConfig.Tunnels))
	copy(tunnels, s.tunnelsConfig.Tunnels)
	return tunnels, nil
}

// SaveTunnelConfig saves (creates or updates) a tunnel configuration.
func (s *Service) SaveTunnelConfig(config sshtunnel.SavedTunnelConfig) error {
	s.configMu.Lock()
	defer s.configMu.Unlock()

	if config.ID == "" {
		config.ID = uuid.NewString()
		log.Printf("Assigning new ID to tunnel config: %s", config.ID)
		s.tunnelsConfig.Tunnels = append(s.tunnelsConfig.Tunnels, config)
	} else {
		found := false
		for i, t := range s.tunnelsConfig.Tunnels {
			if t.ID == config.ID {
				s.tunnelsConfig.Tunnels[i] = config
				found = true
				break
			}
		}
		if !found {
			s.tunnelsConfig.Tunnels = append(s.tunnelsConfig.Tunnels, config)
		}
	}

	return s.saveTunnelsConfig()
}

// DeleteTunnelConfig deletes a tunnel configuration by its ID.
func (s *Service) DeleteTunnelConfig(id string) error {
	s.configMu.Lock()
	defer s.configMu.Unlock()

	foundIndex := -1
	for i, t := range s.tunnelsConfig.Tunnels {
		if t.ID == id {
			foundIndex = i
			break
		}
	}

	if foundIndex != -1 {
		// Remove the element from the slice
		s.tunnelsConfig.Tunnels = append(s.tunnelsConfig.Tunnels[:foundIndex], s.tunnelsConfig.Tunnels[foundIndex+1:]...)
		// Also delete any saved password for this tunnel
		if err := s.sshManager.DeletePassword(id); err != nil {
			// Log as a warning, as the primary operation (deleting the config) succeeded.
			log.Printf("Warning: could not delete password for tunnel ID %s: %v", id, err)
		}

		log.Printf("Deleted tunnel config with ID: %s", id)
		return s.saveTunnelsConfig()
	}

	log.Printf("Could not delete tunnel config: ID %s not found.", id)
	return fmt.Errorf("tunnel config with ID %s not found", id)
}

// deletePasswordsForTunnelsUsingAlias is a helper to clean up keychain entries
// when a host from ~/.ssh/config is deleted.
func (s *Service) deletePasswordsForTunnelsUsingAlias(alias string) error {
	s.configMu.RLock()
	defer s.configMu.RUnlock()

	for _, tunnel := range s.tunnelsConfig.Tunnels {
		if tunnel.HostSource == "ssh_config" && tunnel.HostAlias == alias {
			// This tunnel uses the deleted alias, so we should delete its password.
			if err := s.sshManager.DeletePassword(tunnel.ID); err != nil {
				// Log and continue, don't stop the whole process for one failure.
				log.Printf("Warning: failed to delete password for tunnel %s (using alias %s): %v", tunnel.ID, alias, err)
			}
		}
	}
	return nil
}

// StopForward 停止一个正在运行的隧道
func (a *Service) StopForward(tunnelID string) error {
	// The tunnelManager's cleanup function will now automatically and
	// in a debounced way emit the "tunnels:changed" event.
	return a.tunnelManager.StopForward(tunnelID)
}

// GetActiveTunnels 获取当前活动的隧道列表
func (a *Service) GetActiveTunnels() []sshtunnel.ActiveTunnelInfo {
	return a.tunnelManager.GetActiveTunnels()
}

// SavePassword 将密码安全地存储到系统钥匙串中
func (a *Service) SavePassword(key string, password string) error {
	return a.sshManager.SavePassword(key, password)
}

// DeletePassword 从钥匙串中删除密码
func (s *Service) DeletePassword(key string) error {
	return s.sshManager.DeletePassword(key)
}

// StartTunnelWithPassword 接收前端提供的密码来完成隧道创建
// 注意：我们将原有的 StartLocalForward 函数签名进行扩展
func (a *Service) StartLocalForward(alias string, localPort int, remoteHost string, remotePort int, password string, gatewayPorts bool) (string, error) {
	// 密码保存逻辑已移至前端的 useSshConnection hook 中处理
	return a.tunnelManager.StartLocalForward(alias, localPort, remoteHost, remotePort, password, gatewayPorts)
}

// StartDynamicForward 启动一个动态 SOCKS5 代理隧道
func (a *Service) StartDynamicForward(alias string, localPort int, password string, gatewayPorts bool) (string, error) {
	// 密码保存逻辑已移至前端的 useSshConnection hook 中处理
	return a.tunnelManager.StartDynamicForward(alias, localPort, password, gatewayPorts)
}

// StartTunnelFromConfig starts a tunnel based on a saved configuration ID.
func (s *Service) StartTunnelFromConfig(configID string, password string) (string, error) {
	s.configMu.RLock()
	defer s.configMu.RUnlock()

	var savedConfig *sshtunnel.SavedTunnelConfig
	for i := range s.tunnelsConfig.Tunnels {
		if s.tunnelsConfig.Tunnels[i].ID == configID {
			savedConfig = &s.tunnelsConfig.Tunnels[i]
			break
		}
	}

	if savedConfig == nil {
		return "", fmt.Errorf("tunnel configuration with ID %s not found", configID)
	}

	var connConfig *sshmanager.ConnectionConfig
	var aliasForDisplay string
	var err error

	switch savedConfig.HostSource {
	case "ssh_config":
		aliasForDisplay = savedConfig.HostAlias
		connConfig, _, err = s.sshManager.GetConnectionConfig(aliasForDisplay, password)
		if err != nil {
			return "", fmt.Errorf("failed to get connection config for alias '%s': %w", aliasForDisplay, err)
		}
	case "manual":
		if savedConfig.ManualHost == nil {
			return "", fmt.Errorf("manual host info is missing for tunnel config %s", configID)
		}
		// For manual hosts, we use the config Name as a unique identifier for display/logging.
		aliasForDisplay = savedConfig.Name

		// We need to build a temporary types.SSHHost to use the sshManager's builder.
		tempHost := &types.SSHHost{
			Alias:        aliasForDisplay, // Not strictly needed but good practice
			HostName:     savedConfig.ManualHost.HostName,
			Port:         savedConfig.ManualHost.Port,
			User:         savedConfig.ManualHost.User,
			IdentityFile: savedConfig.ManualHost.IdentityFile,
		}

		connConfig, err = s.sshManager.BuildSSHClientConfig(tempHost, password, savedConfig.ID)
		if err != nil {
			return "", fmt.Errorf("failed to build connection config for manual host: %w", err)
		}
	default:
		return "", fmt.Errorf("unknown host source '%s' for tunnel config %s", savedConfig.HostSource, configID)
	}

	var remoteAddr string
	switch savedConfig.TunnelType {
	case "local":
		remoteAddr = fmt.Sprintf("%s:%d", savedConfig.RemoteHost, savedConfig.RemotePort)
	case "dynamic":
		remoteAddr = "SOCKS5 Proxy"
	default:
		return "", fmt.Errorf("unsupported tunnel type '%s'", savedConfig.TunnelType)
	}

	return s.tunnelManager.CreateTunnelFromConfig(aliasForDisplay, savedConfig.LocalPort, savedConfig.GatewayPorts, savedConfig.TunnelType, remoteAddr, connConfig)
}

// VerifyTunnelConfigConnection performs a pre-flight check for a saved tunnel configuration.
func (s *Service) VerifyTunnelConfigConnection(configID string, password string) (*types.ConnectionResult, error) {
	s.configMu.RLock()
	var savedConfig *sshtunnel.SavedTunnelConfig
	for i := range s.tunnelsConfig.Tunnels {
		if s.tunnelsConfig.Tunnels[i].ID == configID {
			savedConfig = &s.tunnelsConfig.Tunnels[i]
			break
		}
	}
	s.configMu.RUnlock()

	if savedConfig == nil {
		return &types.ConnectionResult{Success: false, ErrorMessage: fmt.Sprintf("tunnel configuration with ID %s not found", configID)}, nil
	}

	var hostToVerify *types.SSHHost
	var err error
	var aliasForDisplay string

	// We need to get a types.SSHHost object to pass to the verification logic.
	switch savedConfig.HostSource {
	case "ssh_config":
		aliasForDisplay = savedConfig.HostAlias
		hostToVerify, err = s.sshManager.GetSSHHostByAlias(aliasForDisplay)
		if err != nil {
			return s.handleSSHConnectError(aliasForDisplay, nil, err)
		}
	case "manual":
		if savedConfig.ManualHost == nil {
			return &types.ConnectionResult{Success: false, ErrorMessage: "manual host info is missing"}, nil
		}
		aliasForDisplay = savedConfig.Name // Use tunnel name as alias for context
		hostToVerify = &types.SSHHost{
			Alias:        aliasForDisplay,
			HostName:     savedConfig.ManualHost.HostName,
			Port:         savedConfig.ManualHost.Port,
			User:         savedConfig.ManualHost.User,
			IdentityFile: savedConfig.ManualHost.IdentityFile,
		}
	default:
		return &types.ConnectionResult{Success: false, ErrorMessage: "unknown host source"}, nil
	}

	// Replicate the core logic of sshmanager.VerifyConnection but with a constructed host object.
	connConfig, err := s.sshManager.BuildSSHClientConfig(hostToVerify, password, savedConfig.ID)
	if err != nil {
		return s.handleSSHConnectError(aliasForDisplay, hostToVerify, err)
	}

	serverAddr := fmt.Sprintf("%s:%s", connConfig.HostName, connConfig.Port)
	client, err := ssh.Dial("tcp", serverAddr, connConfig.ClientConfig)
	if err != nil {
		return s.handleSSHConnectError(aliasForDisplay, hostToVerify, err)
	}
	client.Close()

	return &types.ConnectionResult{Success: true}, nil
}

// -----ssh连接-------------------------------------------------

// 辅助函数，用于处理“预检”阶段的错误
func (a *Service) handleSSHConnectError(alias string, host *types.SSHHost, err error) (*types.ConnectionResult, error) {
	var hostNotFoundError *sshconfig.HostNotFoundError
	var passwordRequiredError *types.PasswordRequiredError
	var authFailedError *types.AuthenticationFailedError
	var keyErr *knownhosts.KeyError

	switch {
	case errors.As(err, &hostNotFoundError):
		log.Printf("Connection check for '%s' failed: Host not found.", alias)
		return &types.ConnectionResult{Success: false, ErrorMessage: "Host not found"}, nil
	case errors.As(err, &passwordRequiredError):
		// 检查是否是需要密码的错误
		log.Printf("Connection check for '%s' failed: Password required.", alias)
		return &types.ConnectionResult{Success: false, PasswordRequired: passwordRequiredError}, nil
	case errors.As(err, &authFailedError):
		log.Printf("Connection check for '%s' failed: Authentication failed.", alias)
		// 我们将这个错误也包装在 PasswordRequired 字段里，
		// 前端可以通过检查 Error() 字符串来区分
		return &types.ConnectionResult{Success: false, PasswordRequired: &types.PasswordRequiredError{Alias: alias}}, nil
	case errors.As(err, &keyErr):
		// 检查是否是主机密钥验证错误
		log.Printf("Host key error for %s, attempting to capture new key...", alias)
		remoteKey, captureErr := a.sshManager.CaptureHostKey(host)
		if captureErr != nil {
			return &types.ConnectionResult{Success: false, ErrorMessage: "Failed to capture remote host key"}, nil
		}
		hostAddress := fmt.Sprintf("%s:%s", host.HostName, host.Port)

		return &types.ConnectionResult{
			Success: false,
			HostKeyVerificationRequired: &types.HostKeyVerificationRequiredError{
				Alias:       alias,
				Fingerprint: ssh.FingerprintSHA256(remoteKey),
				HostAddress: hostAddress,
			},
		}, nil
	default:
		// 其他通用错误
		log.Printf("Error during connection pre-flight check for '%s': %v", alias, err)
		return &types.ConnectionResult{Success: false, ErrorMessage: fmt.Sprintf("Connection pre-flight check failed, %v", err)}, nil
	}
}

// ConnectInTerminal 尝试无密码连接
func (a *Service) ConnectInTerminal(alias string, dryRun bool) (*types.ConnectionResult, error) {
	log.Printf("Attempting connection for '%s'", alias)
	// 执行“预检”
	host, err := a.sshManager.VerifyConnection(alias, "") // password 为空
	if err != nil {
		// 如果预检失败，则将特定错误返回给前端
		return a.handleSSHConnectError(alias, host, err)
	}
	// 预检通过，执行连接
	log.Printf("Pre-flight check for '%s' passed. Launching terminal.", alias)
	// 对于调用第三方ssh终端的，密码是没办法作为 ssh 的参数传递的。只能由用户在ssh终端中输入密码。对于秘钥验证的可以免密登录成功
	// 所以此处不传递 host，只需要传递 alias 就可以
	if err := a.sshManager.ConnectInTerminal(alias, dryRun); err != nil {
		return &types.ConnectionResult{Success: false, ErrorMessage: err.Error()}, nil
	}

	return &types.ConnectionResult{Success: true}, nil
}

// ConnectInTerminalWithPassword 接收密码进行连接
func (a *Service) ConnectInTerminalWithPassword(alias string, password string, savePassword bool, dryRun bool) (*types.ConnectionResult, error) {
	log.Printf("Attempting connection for '%s' with provided password", alias)
	// 预检：使用用户提供的密码
	host, err := a.sshManager.VerifyConnection(alias, password)
	if err != nil {
		return a.handleSSHConnectError(alias, host, err)
	}

	// 预检通过，执行连接
	log.Printf("Credentials for '%s' are valid. Launching terminal.", alias)
	// 只有在连接预检成功后，我们才保存密码，避免保存错误密码
	if savePassword && password != "" {
		log.Printf("Saving password to keychain for key '%s'", alias)
		if err := a.sshManager.SavePassword(alias, password); err != nil {
			log.Printf("Warning: failed to save password for key '%s': %v", alias, err)
		}
	}
	if err := a.sshManager.ConnectInTerminal(alias, dryRun); err != nil {
		return &types.ConnectionResult{Success: false, ErrorMessage: err.Error()}, nil
	}
	return &types.ConnectionResult{Success: true}, nil
}

// ConnectInTerminalAndTrustHost 用户确认后，接受主机指纹并连接
func (a *Service) ConnectInTerminalAndTrustHost(alias string, password string, savePassword bool, dryRun bool) (*types.ConnectionResult, error) {
	log.Printf("User trusted host key for '%s'. Adding to known_hosts.", alias)
	// 先将新的主机密钥添加到 known_hosts 文件
	host, err := a.sshManager.GetSSHHostByAlias(alias)
	if err != nil {
		return &types.ConnectionResult{Success: false, ErrorMessage: err.Error()}, nil
	}
	remoteKey, err := a.sshManager.CaptureHostKey(host)
	if err != nil {
		return &types.ConnectionResult{Success: false, ErrorMessage: err.Error()}, nil
	}
	if err := a.sshManager.AddHostKeyToKnownHosts(host, remoteKey); err != nil {
		// 这是一个非致命错误，我们只记录警告，然后继续尝试连接
		log.Printf("Warning: failed to add host key to known_hosts: %v", err)
	}

	// 信任后，再次尝试连接，但这次可能还需要密码
	// 我们直接调用 ConnectInTerminalWithPassword，如果 password 为空，
	// 它会自动尝试密钥或钥匙串，完美地处理了所有情况。
	log.Printf("Host key for '%s' added. Re-attempting connection.", alias)
	return a.ConnectInTerminalWithPassword(alias, password, savePassword, dryRun)
}
