package sshgate

import "testing"

func TestGetTunnelDetailReturnsSavedConfigRuntimeAndLogs(t *testing.T) {
	service := newProfileTestService(t)
	service.tunnelManager.RecordTunnelLog("tunnel-1", "INFO", "started")

	detail, err := service.GetTunnelDetail("tunnel-1")
	if err != nil {
		t.Fatalf("GetTunnelDetail returned error: %v", err)
	}

	if detail.Config.ID != "tunnel-1" {
		t.Fatalf("expected saved config tunnel-1, got %q", detail.Config.ID)
	}
	if detail.Runtime.Health.Status != "stopped" {
		t.Fatalf("expected stopped runtime health, got %q", detail.Runtime.Health.Status)
	}
	if len(detail.Runtime.Logs) != 1 || detail.Runtime.Logs[0].Message != "started" {
		t.Fatalf("expected tunnel logs, got %#v", detail.Runtime.Logs)
	}
}

func TestGetTunnelDetailRejectsMissingConfig(t *testing.T) {
	service := newProfileTestService(t)

	_, err := service.GetTunnelDetail("missing")
	if err == nil {
		t.Fatal("expected missing tunnel detail to return an error")
	}
}

func TestGetTunnelEventFeedReturnsRecentEventsAcrossSavedTunnels(t *testing.T) {
	service := newProfileTestService(t)
	service.tunnelManager.RecordTunnelLog("tunnel-2", "WARN", "redis disconnected")
	service.tunnelManager.RecordTunnelLog("tunnel-1", "SUCCESS", "database started")

	events := service.GetTunnelEventFeed(10)
	if len(events) != 2 {
		t.Fatalf("expected two tunnel events, got %d", len(events))
	}
	if events[0].ConfigID != "tunnel-1" || events[0].TunnelName != "Database" {
		t.Fatalf("expected newest database event first, got %#v", events[0])
	}
	if events[1].ConfigID != "tunnel-2" || events[1].TunnelName != "Redis" {
		t.Fatalf("expected redis event second, got %#v", events[1])
	}
}

func TestGetTunnelEventFeedAppliesLimit(t *testing.T) {
	service := newProfileTestService(t)
	service.tunnelManager.RecordTunnelLog("tunnel-1", "INFO", "first")
	service.tunnelManager.RecordTunnelLog("tunnel-2", "INFO", "second")

	events := service.GetTunnelEventFeed(1)
	if len(events) != 1 {
		t.Fatalf("expected one limited event, got %d", len(events))
	}
	if events[0].Message != "second" {
		t.Fatalf("expected newest event to be retained, got %#v", events[0])
	}
}
