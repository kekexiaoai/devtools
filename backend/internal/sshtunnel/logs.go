package sshtunnel

import (
	"strings"
	"time"
)

const maxTunnelLogEntries = 200

// RecordTunnelLog appends one bounded in-memory log entry for a saved tunnel.
func (m *Manager) RecordTunnelLog(configID string, level string, message string) {
	configID = strings.TrimSpace(configID)
	if configID == "" {
		return
	}

	m.logMu.Lock()
	defer m.logMu.Unlock()

	m.logSeq++
	entry := TunnelLogEntry{
		Sequence:  m.logSeq,
		Timestamp: formatHealthTime(time.Now().UTC()),
		Level:     normalizeTunnelLogLevel(level),
		Message:   strings.TrimSpace(message),
	}
	if entry.Message == "" {
		entry.Message = "(empty log message)"
	}

	logs := append(m.tunnelLogs[configID], entry)
	if len(logs) > maxTunnelLogEntries {
		logs = logs[len(logs)-maxTunnelLogEntries:]
	}
	m.tunnelLogs[configID] = logs
}

// GetTunnelLogs returns a copy of the bounded in-memory log for one saved tunnel.
func (m *Manager) GetTunnelLogs(configID string) []TunnelLogEntry {
	m.logMu.RLock()
	defer m.logMu.RUnlock()

	logs := m.tunnelLogs[configID]
	copied := make([]TunnelLogEntry, len(logs))
	copy(copied, logs)
	return copied
}

// GetTunnelRuntimeDetail returns the latest runtime state and logs for one saved tunnel.
func (m *Manager) GetTunnelRuntimeDetail(configID string) TunnelRuntimeDetail {
	var activeTunnel *ActiveTunnelInfo
	health := TunnelHealthSnapshot{
		Status:    StatusStopped,
		StatusMsg: "Tunnel is not running.",
	}

	m.mu.RLock()
	for _, tunnel := range m.activeTunnels {
		if tunnel.ConfigID != configID {
			continue
		}
		info := activeTunnelInfoFromTunnel(tunnel)
		activeTunnel = &info
		health = TunnelHealthSnapshot{
			Status:               tunnel.Status,
			StatusMsg:            tunnel.StatusMsg,
			StartedAt:            formatHealthTime(tunnel.StartedAt),
			LastStateChangeAt:    formatHealthTime(tunnel.LastStateChangeAt),
			LastHealthCheckAt:    formatHealthTime(tunnel.LastHealthCheckAt),
			LastHealthCheckError: tunnel.LastHealthCheckError,
			CheckCount:           tunnel.HealthCheckCount,
		}
		break
	}
	m.mu.RUnlock()

	return TunnelRuntimeDetail{
		ActiveTunnel: activeTunnel,
		Health:       health,
		Logs:         m.GetTunnelLogs(configID),
	}
}

func normalizeTunnelLogLevel(level string) string {
	level = strings.ToUpper(strings.TrimSpace(level))
	switch level {
	case "SUCCESS", "ERROR", "WARN", "INFO":
		return level
	default:
		return "INFO"
	}
}
