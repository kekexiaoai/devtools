package sshtunnel

import (
	"context"
	"fmt"
	"net"
	"time"
)

const (
	healthCheckTimeout = 2 * time.Second
	sshCheckTimeout    = 2 * time.Second
)

// TunnelHealthCheckResult describes one manual health check run.
type TunnelHealthCheckResult struct {
	TunnelID            string `json:"tunnelId"`
	CheckedAt           string `json:"checkedAt"`
	Healthy             bool   `json:"healthy"`
	LocalListenerStatus string `json:"localListenerStatus"`
	SSHStatus           string `json:"sshStatus"`
	Error               string `json:"error,omitempty"`
}

// CheckTunnelHealth verifies the local listener and SSH transport for a runtime tunnel.
func (m *Manager) CheckTunnelHealth(tunnelID string) (*TunnelHealthCheckResult, error) {
	m.mu.RLock()
	tunnel, ok := m.activeTunnels[tunnelID]
	if !ok {
		m.mu.RUnlock()
		return nil, fmt.Errorf("tunnel with ID %s not found", tunnelID)
	}
	localAddr := tunnel.LocalAddr
	sshClient := tunnel.sshClient
	m.mu.RUnlock()

	checkedAt := time.Now().UTC()
	result := &TunnelHealthCheckResult{
		TunnelID:            tunnelID,
		CheckedAt:           formatHealthTime(checkedAt),
		Healthy:             true,
		LocalListenerStatus: "ok",
		SSHStatus:           "skipped",
	}

	if err := checkLocalListener(localAddr); err != nil {
		result.Healthy = false
		result.LocalListenerStatus = "failed"
		result.Error = fmt.Sprintf("local listener check failed: %v", err)
	}

	if sshClient != nil {
		result.SSHStatus = "ok"
		if err := checkSSHClient(sshClient, sshCheckTimeout); err != nil {
			result.Healthy = false
			result.SSHStatus = "failed"
			if result.Error == "" {
				result.Error = fmt.Sprintf("ssh keepalive check failed: %v", err)
			} else {
				result.Error = fmt.Sprintf("%s; ssh keepalive check failed: %v", result.Error, err)
			}
		}
	}

	m.mu.Lock()
	if currentTunnel, exists := m.activeTunnels[tunnelID]; exists {
		currentTunnel.LastHealthCheckAt = checkedAt
		currentTunnel.HealthCheckCount++
		currentTunnel.LastHealthCheckError = result.Error
		if result.Healthy {
			currentTunnel.StatusMsg = "Last health check passed."
			if currentTunnel.Status == StatusDisconnected {
				currentTunnel.Status = StatusActive
				currentTunnel.LastStateChangeAt = checkedAt
			}
		} else {
			currentTunnel.Status = StatusDisconnected
			currentTunnel.StatusMsg = result.Error
			currentTunnel.LastStateChangeAt = checkedAt
		}
	}
	m.mu.Unlock()

	m.debounceChangeEvent()
	return result, nil
}

func checkLocalListener(localAddr string) error {
	dialAddr := normalizeLocalDialAddr(localAddr)
	conn, err := net.DialTimeout("tcp", dialAddr, healthCheckTimeout)
	if err != nil {
		return err
	}
	return conn.Close()
}

func normalizeLocalDialAddr(localAddr string) string {
	host, port, err := net.SplitHostPort(localAddr)
	if err != nil {
		return localAddr
	}
	if host == "" || host == "0.0.0.0" || host == "::" || host == "[::]" {
		return net.JoinHostPort("127.0.0.1", port)
	}
	return localAddr
}

type sshKeepAliveClient interface {
	SendRequest(name string, wantReply bool, payload []byte) (bool, []byte, error)
}

func checkSSHClient(client sshKeepAliveClient, timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	errC := make(chan error, 1)
	go func() {
		_, _, err := client.SendRequest("keepalive@openssh.com", true, nil)
		errC <- err
	}()

	select {
	case err := <-errC:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func formatHealthTime(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.UTC().Format(time.RFC3339)
}
