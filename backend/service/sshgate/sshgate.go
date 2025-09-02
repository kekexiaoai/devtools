package sshgate

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"devtools/backend/internal/sshmanager"
	"devtools/backend/internal/sshtunnel"
	"devtools/backend/internal/types"
	"devtools/backend/pkg/sshconfig"

	"github.com/google/uuid"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"
)

// TunnelsConfig is the root object for the tunnels JSON configuration file.
type TunnelsConfig struct {
	Tunnels      []sshtunnel.SavedTunnelConfig `json:"tunnels"`
	TunnelsOrder []string                      `json:"tunnelsOrder,omitempty"`
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

	// For debouncing frontend events for saved tunnels
	savedTunnelsEventDebouncer   *time.Timer
	savedTunnelsDebounceDuration time.Duration
	savedTunnelsEventMu          sync.Mutex
}

// NewService 是 SSHGate 服务的构造函数
func NewService(sshMgr *sshmanager.Manager) *Service {
	tunnelMgr := sshtunnel.NewManager(sshMgr)
	s := &Service{
		sshManager:                   sshMgr,
		tunnelManager:                tunnelMgr,
		tunnelsConfig:                &TunnelsConfig{Tunnels: []sshtunnel.SavedTunnelConfig{}},
		savedTunnelsDebounceDuration: 200 * time.Millisecond,
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
// originalAlias 是编辑前的主机别名。如果为空，则表示是新增主机。
func (a *Service) SaveSSHHost(host types.SSHHost, originalAlias string) error {
	if err := validateAndSanitizeHost(&host); err != nil {
		return err
	}

	isNewHost := originalAlias == ""
	isRename := !isNewHost && originalAlias != host.Alias

	// 1. 处理重命名逻辑
	if isRename {
		// 检查新别名是否已存在
		if a.sshManager.HasHost(host.Alias) {
			return fmt.Errorf("host with alias '%s' already exists", host.Alias)
		}
		// 在 ~/.ssh/config 文件中重命名
		if err := a.sshManager.RenameHost(originalAlias, host.Alias); err != nil {
			return fmt.Errorf("failed to rename host from '%s' to '%s': %w", originalAlias, host.Alias, err)
		}
		// 在钥匙串中重命名密码
		if err := a.sshManager.RenamePassword(originalAlias, host.Alias); err != nil {
			// 这是一个非关键错误，只记录日志
			log.Printf("Warning: failed to rename password in keychain from '%s' to '%s': %v", originalAlias, host.Alias, err)
		}
		// 更新使用此别名的已保存隧道
		if err := a.updateTunnelsUsingAlias(originalAlias, host.Alias); err != nil {
			log.Printf("Warning: failed to update saved tunnels from alias '%s' to '%s': %v", originalAlias, host.Alias, err)
		}
	}

	// 2. 准备要更新的参数
	params := make(map[string]string)
	params["HostName"] = host.HostName
	params["User"] = host.User
	params["Port"] = host.Port
	params["IdentityFile"] = host.IdentityFile

	updateReq := sshmanager.HostUpdateRequest{
		Name:   host.Alias, // 总是使用最新的别名
		Params: params,
	}

	// 3. 执行新增或更新操作
	if isNewHost {
		if a.sshManager.HasHost(host.Alias) {
			return fmt.Errorf("host with alias '%s' already exists", host.Alias)
		}
		// AddHostWithParams 内部会调用 Save()
		return a.sshManager.AddHostWithParams(updateReq)
	}

	// 对于普通更新和重命名后的更新，都执行 UpdateHost
	// UpdateHost 内部会调用 Save()
	return a.sshManager.UpdateHost(updateReq)
}

// DeleteSSHHost 删除一个 SSH 主机配置
func (a *Service) DeleteSSHHost(alias string) error {
	// When deleting a host, we should also clean up any associated passwords.
	// 1. Delete the password for the host alias itself.
	if err := a.sshManager.DeletePassword(alias); err != nil {
		// This is a non-critical error, so we only log it.
		log.Printf("Warning: failed to delete password for alias %s: %v", alias, err)
	}

	// 2. Delete passwords for any tunnels that depend on this host alias.
	if err := a.deletePasswordsForTunnelsUsingAlias(alias); err != nil {
		log.Printf("Warning: failed to delete passwords for tunnels using alias %s: %v", alias, err)
	}
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
	s.debounceSavedTunnelsChangeEvent()
	return nil
}

// debounceSavedTunnelsChangeEvent schedules a "saved_tunnels_changed" event to be sent to the frontend.
func (s *Service) debounceSavedTunnelsChangeEvent() {
	s.savedTunnelsEventMu.Lock()
	defer s.savedTunnelsEventMu.Unlock()

	if s.savedTunnelsEventDebouncer != nil {
		s.savedTunnelsEventDebouncer.Stop()
	}

	s.savedTunnelsEventDebouncer = time.AfterFunc(s.savedTunnelsDebounceDuration, func() {
		log.Println("Debouncer fired: emitting 'saved_tunnels_changed' event to frontend.")
		// This runs in a new goroutine, so we wrap it for safety.
		runtime.EventsEmit(s.ctx, "saved_tunnels_changed")
	})
}

// GetSavedTunnels retrieves all saved tunnel configurations.
func (s *Service) GetSavedTunnels() ([]sshtunnel.SavedTunnelConfig, error) {
	s.configMu.RLock()
	defer s.configMu.RUnlock()

	// If no custom order is defined, or if it's out of sync, return the default order.
	if len(s.tunnelsConfig.TunnelsOrder) == 0 {
		// Return a copy to avoid race conditions if the caller modifies the slice.
		tunnels := make([]sshtunnel.SavedTunnelConfig, len(s.tunnelsConfig.Tunnels))
		copy(tunnels, s.tunnelsConfig.Tunnels)
		return tunnels, nil
	}

	// Create a map for quick lookup of tunnels by ID.
	tunnelMap := make(map[string]sshtunnel.SavedTunnelConfig, len(s.tunnelsConfig.Tunnels))
	for _, t := range s.tunnelsConfig.Tunnels {
		tunnelMap[t.ID] = t
	}

	// Create the ordered list based on TunnelsOrder.
	orderedTunnels := make([]sshtunnel.SavedTunnelConfig, 0, len(s.tunnelsConfig.Tunnels))
	// Keep track of which tunnels have been added to the ordered list.
	addedTunnels := make(map[string]bool)

	for _, id := range s.tunnelsConfig.TunnelsOrder {
		if tunnel, ok := tunnelMap[id]; ok {
			orderedTunnels = append(orderedTunnels, tunnel)
			addedTunnels[id] = true
		}
	}

	// Find any tunnels that are in the config but not in the order list (e.g., newly created ones).
	var unorderedTunnels []sshtunnel.SavedTunnelConfig
	// To maintain the original order of new items (which are prepended), we iterate through the original slice.
	for _, tunnel := range s.tunnelsConfig.Tunnels {
		if _, ok := addedTunnels[tunnel.ID]; !ok {
			unorderedTunnels = append(unorderedTunnels, tunnel)
		}
	}

	// Prepend the unordered (new) tunnels to the ordered list to ensure they appear at the top.
	finalTunnels := append(unorderedTunnels, orderedTunnels...)

	return finalTunnels, nil
}

// SaveTunnelConfig saves (creates or updates) a tunnel configuration.
func (s *Service) SaveTunnelConfig(config sshtunnel.SavedTunnelConfig) error {
	s.configMu.Lock()
	defer s.configMu.Unlock()

	if config.ID == "" {
		config.ID = uuid.NewString()
		log.Printf("Assigning new ID to tunnel config: %s", config.ID)
		// Prepend the new config to the slice so it appears at the top of the list.
		s.tunnelsConfig.Tunnels = append([]sshtunnel.SavedTunnelConfig{config}, s.tunnelsConfig.Tunnels...)
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
			// This case should ideally not be hit for an existing ID, but if it is,
			// treat it as a new addition and prepend it.
			s.tunnelsConfig.Tunnels = append([]sshtunnel.SavedTunnelConfig{config}, s.tunnelsConfig.Tunnels...)
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

		// Also remove from the order slice to keep it clean
		if len(s.tunnelsConfig.TunnelsOrder) > 0 {
			newOrder := make([]string, 0, len(s.tunnelsConfig.TunnelsOrder)-1)
			for _, orderID := range s.tunnelsConfig.TunnelsOrder {
				if orderID != id {
					newOrder = append(newOrder, orderID)
				}
			}
			s.tunnelsConfig.TunnelsOrder = newOrder
		}
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

// DuplicateTunnelConfig creates a copy of an existing tunnel configuration.
func (s *Service) DuplicateTunnelConfig(id string) (*sshtunnel.SavedTunnelConfig, error) {
	s.configMu.Lock()
	defer s.configMu.Unlock()

	var originalConfig *sshtunnel.SavedTunnelConfig
	for i := range s.tunnelsConfig.Tunnels {
		if s.tunnelsConfig.Tunnels[i].ID == id {
			originalConfig = &s.tunnelsConfig.Tunnels[i]
			break
		}
	}

	if originalConfig == nil {
		return nil, fmt.Errorf("tunnel config with ID %s not found", id)
	}

	// Create a deep copy to avoid pointer issues, especially with ManualHost
	newConfig := *originalConfig
	if originalConfig.ManualHost != nil {
		newManualHost := *originalConfig.ManualHost
		newConfig.ManualHost = &newManualHost
	}

	// Assign a new ID and a new name
	newConfig.ID = uuid.NewString()
	newConfig.Name = fmt.Sprintf("%s (copy)", originalConfig.Name)

	// Prepend the new config to the list so it appears at the top.
	s.tunnelsConfig.Tunnels = append([]sshtunnel.SavedTunnelConfig{newConfig}, s.tunnelsConfig.Tunnels...)

	return &newConfig, s.saveTunnelsConfig()
}

// UpdateTunnelsOrder saves the new order of tunnels.
func (s *Service) UpdateTunnelsOrder(order []string) error {
	s.configMu.Lock()
	defer s.configMu.Unlock()

	s.tunnelsConfig.TunnelsOrder = order
	log.Printf("Updating tunnels order. New order has %d items.", len(order))

	// We save the entire config, which now includes the new order.
	// This will also trigger the 'saved_tunnels_changed' event, which is what we want,
	// so the frontend re-fetches the correctly ordered list.
	return s.saveTunnelsConfig()
}

// updateTunnelsUsingAlias updates saved tunnel configurations when a host alias is renamed.
func (s *Service) updateTunnelsUsingAlias(oldAlias, newAlias string) error {
	s.configMu.Lock()
	defer s.configMu.Unlock()

	changed := false
	for i, tunnel := range s.tunnelsConfig.Tunnels {
		if tunnel.HostSource == "ssh_config" && tunnel.HostAlias == oldAlias {
			s.tunnelsConfig.Tunnels[i].HostAlias = newAlias
			changed = true
		}
	}

	if changed {
		log.Printf("Updated alias from %s to %s in saved tunnel configurations.", oldAlias, newAlias)
		// saveTunnelsConfig will also emit the 'saved_tunnels_changed' event,
		// which will cause the frontend to refresh its list.
		return s.saveTunnelsConfig()
	}
	return nil
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
			// Do not use %w to wrap the error. The underlying error can be a complex type that causes
			// serialization issues with the Wails IPC bridge. Use err.Error() to convert it to a simple string.
			return "", fmt.Errorf("failed to get connection config for alias '%s': %s", aliasForDisplay, err.Error())
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
			// Do not use %w to wrap the error. The underlying error can be a complex type that causes
			// serialization issues with the Wails IPC bridge. Use err.Error() to convert it to a simple string.
			return "", fmt.Errorf("failed to build connection config for manual host: %s", err.Error())
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

	result, err := s.tunnelManager.CreateTunnelFromConfig(configID, aliasForDisplay, savedConfig.LocalPort, savedConfig.GatewayPorts, savedConfig.TunnelType, remoteAddr, connConfig)
	if err != nil {
		return "", s.translateNetworkError(err, aliasForDisplay)
	}
	return result, nil
}

// CreateAndStartTunnel handles an on-the-fly tunnel request from the TunnelDialog.
// It checks if a matching configuration already exists. If so, it starts that one.
// If not, it creates a new SavedTunnelConfig, saves it, and then starts it.
// This approach prevents creating duplicate tunnel configurations.
func (s *Service) CreateAndStartTunnel(
	tunnelType string,
	hostAlias string,
	localPort int,
	remoteHost string,
	remotePort int,
	gatewayPorts bool,
	password string,
) (string, error) {
	s.configMu.Lock()

	var configIDToStart string
	found := false

	// --- Check for existing tunnel config ---
	for _, t := range s.tunnelsConfig.Tunnels {
		if t.TunnelType == tunnelType && t.HostSource == "ssh_config" && t.HostAlias == hostAlias && t.LocalPort == localPort && t.GatewayPorts == gatewayPorts {
			isMatch := false
			switch tunnelType {
			case "local":
				if t.RemoteHost == remoteHost && t.RemotePort == remotePort {
					isMatch = true
				}
			case "dynamic":
				isMatch = true
			}

			if isMatch {
				log.Printf("Found existing tunnel configuration with ID %s.", t.ID)
				configIDToStart = t.ID
				found = true
				break
			}
		}
	}

	if !found {
		log.Println("No existing tunnel configuration found. Creating a new one.")
		newConfig := sshtunnel.SavedTunnelConfig{
			ID:           uuid.NewString(),
			TunnelType:   tunnelType,
			LocalPort:    localPort,
			GatewayPorts: gatewayPorts,
			HostSource:   "ssh_config",
			HostAlias:    hostAlias,
			RemoteHost:   remoteHost,
			RemotePort:   remotePort,
		}
		newConfig.Name = generateTunnelName(&newConfig)

		s.tunnelsConfig.Tunnels = append([]sshtunnel.SavedTunnelConfig{newConfig}, s.tunnelsConfig.Tunnels...)
		if err := s.saveTunnelsConfig(); err != nil {
			s.configMu.Unlock()
			return "", fmt.Errorf("failed to auto-save new tunnel config: %w", err)
		}
		configIDToStart = newConfig.ID
	}

	s.configMu.Unlock() // Unlock before calling StartTunnelFromConfig to avoid deadlock.

	return s.StartTunnelFromConfig(configIDToStart, password)
}

// generateTunnelName creates a descriptive name for a tunnel configuration.
func generateTunnelName(config *sshtunnel.SavedTunnelConfig) string {
	switch config.TunnelType {
	case "local":
		return fmt.Sprintf("L-%d -> %s:%d", config.LocalPort, config.RemoteHost, config.RemotePort)
	case "dynamic":
		return fmt.Sprintf("D-%d (SOCKS5)", config.LocalPort)
	default:
		return "Unnamed Tunnel"
	}
}

// TrustHostKeyForTunnel captures the host key for a given tunnel configuration and adds it to known_hosts.
// This is used when the user explicitly trusts a new host during a 'verify' connection flow.
func (s *Service) TrustHostKeyForTunnel(configID string) error {
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
		return fmt.Errorf("tunnel configuration with ID %s not found", configID)
	}

	var hostToTrust *types.SSHHost
	var err error

	switch savedConfig.HostSource {
	case "ssh_config":
		hostToTrust, err = s.sshManager.GetSSHHostByAlias(savedConfig.HostAlias)
		if err != nil {
			return fmt.Errorf("failed to get host details for alias '%s': %w", savedConfig.HostAlias, err)
		}
	case "manual":
		if savedConfig.ManualHost == nil {
			return fmt.Errorf("manual host info is missing for tunnel config %s", configID)
		}
		hostToTrust = &types.SSHHost{
			Alias:        savedConfig.Name,
			HostName:     savedConfig.ManualHost.HostName,
			Port:         savedConfig.ManualHost.Port,
			User:         savedConfig.ManualHost.User,
			IdentityFile: savedConfig.ManualHost.IdentityFile,
		}
	default:
		return fmt.Errorf("unknown host source '%s' for tunnel config %s", savedConfig.HostSource, configID)
	}

	remoteKey, err := s.sshManager.CaptureHostKey(hostToTrust)
	if err != nil {
		return fmt.Errorf("failed to capture remote host key: %w", err)
	}
	if err := s.sshManager.AddHostKeyToKnownHosts(hostToTrust, remoteKey); err != nil {
		// This should be a critical error in this context.
		return fmt.Errorf("failed to add host key to known_hosts: %w", err)
	}

	log.Printf("Successfully added host key for tunnel '%s' to known_hosts.", savedConfig.Name)
	return nil
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

// translateSyscallError is a platform-specific helper to translate syscall errors.
// It is defined in sshgate_unix.go and sshgate_windows.go.
// func translateSyscallError(syscallErr *os.SyscallError, hostIdentifier string) error

// translateNetworkError converts raw network or SSH errors into user-friendly,
// IPC-safe error messages. It's crucial for providing clear feedback to the frontend
// and avoiding serialization issues with complex Go error types.
func (s *Service) translateNetworkError(err error, hostIdentifier string) error {
	if err == nil {
		return nil
	}

	// First, check for specific structured errors if they are passed up.
	var passwordRequiredError *types.PasswordRequiredError
	if errors.As(err, &passwordRequiredError) {
		return fmt.Errorf("password is required for '%s'", hostIdentifier)
	}

	// Now, dissect generic network errors.
	var opErr *net.OpError
	if errors.As(err, &opErr) {
		if opErr.Timeout() {
			return fmt.Errorf("connection to '%s' timed out, the server may be offline or firewalled", hostIdentifier)
		}

		var dnsErr *net.DNSError
		if errors.As(opErr.Err, &dnsErr) {
			return fmt.Errorf("could not resolve hostname for '%s': %s, check the hostname and your DNS settings", hostIdentifier, dnsErr.Name)
		}

		var syscallErr *os.SyscallError
		if errors.As(opErr.Err, &syscallErr) {
			// Delegate to platform-specific implementation.
			if translatedErr := translateSyscallError(syscallErr, hostIdentifier); translatedErr != nil {
				return translatedErr
			}
		}
	}

	// Check for common error strings from SSH and net libraries.
	errMsg := strings.ToLower(err.Error())
	if strings.Contains(errMsg, "address already in use") {
		return fmt.Errorf("the local port is already in use, please choose another port")
	}
	if strings.Contains(errMsg, "unable to authenticate") || strings.Contains(errMsg, "permission denied") || strings.Contains(errMsg, "authentication failed") {
		return fmt.Errorf("authentication failed for '%s', please check your password or SSH key", hostIdentifier)
	}

	// Fallback for any other error.
	return fmt.Errorf("an unexpected error occurred for '%s': %v", hostIdentifier, err)
}

// 辅助函数，用于处理“预检”阶段的错误
func (a *Service) handleSSHConnectError(alias string, host *types.SSHHost, err error) (*types.ConnectionResult, error) {
	var hostNotFoundError *sshconfig.HostNotFoundError
	var passwordRequiredError *types.PasswordRequiredError
	var authFailedError *types.AuthenticationFailedError
	var keyErr *knownhosts.KeyError

	// Check for specific error strings first, as they are more reliable for generic errors from the ssh library.
	if err != nil {
		errMsg := err.Error()
		// "unable to authenticate" is a common message for wrong password/key.
		// "permission denied" can also indicate auth failure.
		if strings.Contains(errMsg, "unable to authenticate") || strings.Contains(errMsg, "permission denied") {
			log.Printf("Connection check for '%s' failed with auth error: %v. Re-prompting for password.", alias, err)
			return &types.ConnectionResult{Success: false, PasswordRequired: &types.PasswordRequiredError{Alias: alias, Message: "Authentication failed. Please try again."}}, nil
		}
	}

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
		// For other generic network errors, translate them into a user-friendly message.
		translatedErr := a.translateNetworkError(err, alias)
		log.Printf("Error during connection pre-flight check for '%s': %v", alias, err)
		return &types.ConnectionResult{Success: false, ErrorMessage: translatedErr.Error()}, nil
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

// UpdateHostsOrder saves the new order of hosts from the visual editor.
func (s *Service) UpdateHostsOrder(orderedAliases []string) error {
	// 调用 sshmanager 中实现的排序方法
	return s.sshManager.ReorderHosts(orderedAliases)
}
