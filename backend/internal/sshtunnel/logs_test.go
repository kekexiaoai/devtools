package sshtunnel

import (
	"testing"
	"time"
)

func TestTunnelLogsAreScopedAndCappedByConfigID(t *testing.T) {
	manager := NewManager(nil)

	for i := 0; i < maxTunnelLogEntries+5; i++ {
		manager.RecordTunnelLog("config-1", "INFO", "entry")
	}
	manager.RecordTunnelLog("config-2", "ERROR", "other")

	logs := manager.GetTunnelLogs("config-1")
	if len(logs) != maxTunnelLogEntries {
		t.Fatalf("expected capped logs, got %d", len(logs))
	}
	if logs[0].Sequence != 6 {
		t.Fatalf("expected oldest retained sequence 6, got %d", logs[0].Sequence)
	}
	if logs[len(logs)-1].Sequence != maxTunnelLogEntries+5 {
		t.Fatalf("expected newest retained sequence %d, got %d", maxTunnelLogEntries+5, logs[len(logs)-1].Sequence)
	}

	otherLogs := manager.GetTunnelLogs("config-2")
	if len(otherLogs) != 1 || otherLogs[0].Message != "other" {
		t.Fatalf("expected config scoped logs, got %#v", otherLogs)
	}
}

func TestGetTunnelDetailCombinesActiveInfoAndLogs(t *testing.T) {
	manager := NewManager(nil)
	manager.activeTunnels["runtime-1"] = &Tunnel{
		ID:                "runtime-1",
		ConfigID:          "config-1",
		Alias:             "db",
		Type:              "local",
		LocalAddr:         "127.0.0.1:15432",
		RemoteAddr:        "10.0.0.5:5432",
		Status:            StatusActive,
		StatusMsg:         "Connection established.",
		HealthCheckCount:  2,
		LastHealthCheckAt: mustParseTunnelTestTime(t, "2026-05-04T08:00:00Z"),
	}
	manager.RecordTunnelLog("config-1", "INFO", "started")

	detail := manager.GetTunnelRuntimeDetail("config-1")
	if detail.ActiveTunnel == nil {
		t.Fatal("expected active tunnel detail")
	}
	if detail.ActiveTunnel.ID != "runtime-1" {
		t.Fatalf("expected runtime-1, got %q", detail.ActiveTunnel.ID)
	}
	if len(detail.Logs) != 1 || detail.Logs[0].Message != "started" {
		t.Fatalf("expected tunnel logs, got %#v", detail.Logs)
	}
	if detail.Health.Status != StatusActive {
		t.Fatalf("expected active health status, got %q", detail.Health.Status)
	}
	if detail.Health.CheckCount != 2 {
		t.Fatalf("expected health check count 2, got %d", detail.Health.CheckCount)
	}
}

func mustParseTunnelTestTime(t *testing.T, value string) time.Time {
	t.Helper()

	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		t.Fatalf("failed to parse test time: %v", err)
	}
	return parsed
}
