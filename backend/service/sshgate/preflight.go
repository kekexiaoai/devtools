package sshgate

import (
	"fmt"
	"net"
	"time"

	"devtools/backend/internal/sshmanager"
	"devtools/backend/internal/sshtunnel"
	"devtools/backend/internal/types"

	"golang.org/x/crypto/ssh"
)

const preflightTimeout = 3 * time.Second

type TunnelPreflightCheck struct {
	Name    string `json:"name"`
	Status  string `json:"status"`
	Message string `json:"message"`
}

type TunnelPreflightResult struct {
	TunnelID   string                 `json:"tunnelId"`
	TunnelName string                 `json:"tunnelName"`
	CheckedAt  string                 `json:"checkedAt"`
	Healthy    bool                   `json:"healthy"`
	Checks     []TunnelPreflightCheck `json:"checks"`
}

func (s *Service) RunTunnelPreflight(configID string, password string) (*TunnelPreflightResult, error) {
	checkedAt := time.Now().UTC().Format(time.RFC3339)
	result := &TunnelPreflightResult{
		TunnelID:  configID,
		CheckedAt: checkedAt,
		Healthy:   true,
		Checks:    []TunnelPreflightCheck{},
	}

	config, ok := s.savedTunnelConfig(configID)
	if !ok {
		result.Healthy = false
		result.Checks = append(result.Checks, TunnelPreflightCheck{
			Name:    "config",
			Status:  "failed",
			Message: fmt.Sprintf("Tunnel configuration with ID %s was not found.", configID),
		})
		return result, nil
	}
	result.TunnelName = config.Name
	result.addCheck("config", "passed", "Tunnel configuration exists.")

	if activeID, ok := s.activeRuntimeIDForConfig(config.ID); ok {
		result.addCheck("local_port", "skipped", fmt.Sprintf("Tunnel is already active as %s.", activeID))
	} else if err := checkLocalPortAvailable(config.LocalPort, config.GatewayPorts); err != nil {
		result.addCheck("local_port", "failed", fmt.Sprintf("Local port %d is not available: %v", config.LocalPort, err))
	} else {
		result.addCheck("local_port", "passed", fmt.Sprintf("Local port %d is available.", config.LocalPort))
	}

	client, sshMessage, sshErr := s.openPreflightSSHClient(config, password)
	if sshErr != nil {
		result.addCheck("ssh_connection", "failed", sshMessage)
		result.addCheck("remote_target", "skipped", "Remote target check requires a working SSH connection.")
		result.finalize()
		return result, nil
	}
	defer client.Close()
	result.addCheck("ssh_connection", "passed", sshMessage)

	if config.TunnelType != "local" {
		result.addCheck("remote_target", "skipped", "Remote target check is only required for local forwarding tunnels.")
		result.finalize()
		return result, nil
	}

	remoteAddr := fmt.Sprintf("%s:%d", config.RemoteHost, config.RemotePort)
	if err := checkRemoteTargetViaSSH(client, remoteAddr); err != nil {
		result.addCheck("remote_target", "failed", fmt.Sprintf("Remote target %s is not reachable through SSH: %v", remoteAddr, err))
	} else {
		result.addCheck("remote_target", "passed", fmt.Sprintf("Remote target %s is reachable through SSH.", remoteAddr))
	}
	result.finalize()
	return result, nil
}

func (r *TunnelPreflightResult) addCheck(name string, status string, message string) {
	r.Checks = append(r.Checks, TunnelPreflightCheck{
		Name:    name,
		Status:  status,
		Message: message,
	})
}

func (r *TunnelPreflightResult) finalize() {
	r.Healthy = true
	for _, check := range r.Checks {
		if check.Status == "failed" {
			r.Healthy = false
			return
		}
	}
}

func (s *Service) savedTunnelConfig(id string) (sshtunnel.SavedTunnelConfig, bool) {
	s.configMu.RLock()
	defer s.configMu.RUnlock()

	for _, tunnel := range s.tunnelsConfig.Tunnels {
		if tunnel.ID == id {
			return tunnel, true
		}
	}
	return sshtunnel.SavedTunnelConfig{}, false
}

func checkLocalPortAvailable(localPort int, gatewayPorts bool) error {
	bindAddr := "127.0.0.1"
	if gatewayPorts {
		bindAddr = "0.0.0.0"
	}
	listener, err := net.Listen("tcp", fmt.Sprintf("%s:%d", bindAddr, localPort))
	if err != nil {
		return err
	}
	return listener.Close()
}

func (s *Service) openPreflightSSHClient(config sshtunnel.SavedTunnelConfig, password string) (*ssh.Client, string, error) {
	if s.sshManager == nil {
		return nil, "SSH manager is not available in this runtime.", fmt.Errorf("ssh manager unavailable")
	}

	connConfig, displayName, err := s.preflightConnectionConfig(config, password)
	if err != nil {
		return nil, err.Error(), err
	}

	serverAddr := fmt.Sprintf("%s:%s", connConfig.HostName, connConfig.Port)
	client, err := ssh.Dial("tcp", serverAddr, connConfig.ClientConfig)
	if err != nil {
		translated := s.translateNetworkError(err, displayName)
		return nil, translated.Error(), translated
	}
	return client, fmt.Sprintf("SSH host %s is reachable.", displayName), nil
}

func (s *Service) preflightConnectionConfig(config sshtunnel.SavedTunnelConfig, password string) (*sshmanager.ConnectionConfig, string, error) {
	switch config.HostSource {
	case "ssh_config":
		connConfig, _, err := s.sshManager.GetConnectionConfig(config.HostAlias, password)
		if err != nil {
			return nil, config.HostAlias, fmt.Errorf("failed to get connection config for alias '%s': %s", config.HostAlias, err.Error())
		}
		return connConfig, config.HostAlias, nil
	case "manual":
		if config.ManualHost == nil {
			return nil, config.Name, fmt.Errorf("manual host info is missing")
		}
		host := &types.SSHHost{
			Alias:        config.Name,
			HostName:     config.ManualHost.HostName,
			Port:         config.ManualHost.Port,
			User:         config.ManualHost.User,
			IdentityFile: config.ManualHost.IdentityFile,
		}
		connConfig, err := s.sshManager.BuildSSHClientConfig(host, password, config.ID)
		if err != nil {
			return nil, config.Name, fmt.Errorf("failed to build connection config for manual host: %s", err.Error())
		}
		return connConfig, config.Name, nil
	default:
		return nil, config.Name, fmt.Errorf("unknown host source '%s'", config.HostSource)
	}
}

func checkRemoteTargetViaSSH(client *ssh.Client, remoteAddr string) error {
	errC := make(chan error, 1)
	go func() {
		conn, err := client.Dial("tcp", remoteAddr)
		if err == nil {
			_ = conn.Close()
		}
		errC <- err
	}()

	select {
	case err := <-errC:
		return err
	case <-time.After(preflightTimeout):
		return fmt.Errorf("timed out after %s", preflightTimeout)
	}
}
