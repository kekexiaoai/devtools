package sshgate

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"

	"devtools/backend/internal/sshmanager"
	"devtools/backend/internal/sshtunnel"
	"devtools/backend/internal/types"
	"devtools/backend/pkg/sshconfig"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"
)

// Service 封装了所有与 SSH Gate 功能相关的后端逻辑
type Service struct {
	ctx           context.Context
	sshManager    *sshmanager.Manager
	tunnelManager *sshtunnel.Manager
}

// NewService 是 SSHGate 服务的构造函数
func NewService(ctx context.Context, sshMgr *sshmanager.Manager) *Service {
	tunnelMgr := sshtunnel.NewManager(ctx, sshMgr)
	return &Service{
		ctx:           ctx,
		sshManager:    sshMgr,
		tunnelManager: tunnelMgr,
	}
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

// SaveSSHHost 保存（新增或更新）一个 SSH 主机配置
func (a *Service) SaveSSHHost(host types.SSHHost) error {
	host.Alias = strings.TrimSpace(host.Alias)
	if host.Alias == "" {
		return errors.New("alias is required")
	}
	if strings.Contains(host.Alias, " ") {
		return errors.New("alias cannot contain space")
	}
	host.HostName = strings.TrimSpace(host.HostName)
	if host.HostName == "" {
		return errors.New("hostName is required")
	}
	host.User = strings.TrimSpace(host.User)
	if host.User == "" {
		return errors.New("user is required")
	}
	host.Port = strings.TrimSpace(host.Port)
	host.IdentityFile = strings.TrimSpace(host.IdentityFile)

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

// StopForward 停止一个正在运行的隧道
func (a *Service) StopForward(tunnelID string) error {
	return a.tunnelManager.StopForward(tunnelID)
}

// GetActiveTunnels 获取当前活动的隧道列表
func (a *Service) GetActiveTunnels() []sshtunnel.ActiveTunnelInfo {
	return a.tunnelManager.GetActiveTunnels()
}

// SavePasswordForAlias 将主机的密码安全地存储到系统钥匙串中
func (a *Service) SavePasswordForAlias(alias string, password string) error {
	return a.sshManager.SavePasswordForAlias(alias, password)
}

// DeletePasswordForAlias 当用户删除主机配置时，也从钥匙串中删除密码
func (a *Service) DeletePasswordForAlias(alias string) error {
	return a.sshManager.DeletePasswordForAlias(alias)
}

// StartTunnelWithPassword 接收前端提供的密码来完成隧道创建
// 注意：我们将原有的 StartLocalForward 函数签名进行扩展
func (a *Service) StartLocalForward(alias string, localPort int, remoteHost string, remotePort int, password string) (string, error) {
	// 密码保存逻辑已移至前端的 useSshConnection hook 中处理
	return a.tunnelManager.StartLocalForward(alias, localPort, remoteHost, remotePort, password)
}

// StartDynamicForward 启动一个动态 SOCKS5 代理隧道
func (a *Service) StartDynamicForward(alias string, localPort int, password string) (string, error) {
	// 密码保存逻辑已移至前端的 useSshConnection hook 中处理
	return a.tunnelManager.StartDynamicForward(alias, localPort, password)
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
		return &types.ConnectionResult{Success: false, ErrorMessage: "Connection pre-flight check failed"}, nil
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
		log.Printf("Saving password to keychain for '%s'", alias)
		if err := a.sshManager.SavePasswordForAlias(alias, password); err != nil {
			log.Printf("Warning: failed to save password: %v", err)
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
