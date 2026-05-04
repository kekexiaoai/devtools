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
