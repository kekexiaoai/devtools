package sshtunnel

import (
	"net"
	"testing"
)

func TestCheckTunnelHealthUpdatesSuccessfulLocalListenerCheck(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to create listener: %v", err)
	}
	defer listener.Close()

	manager := NewManager(nil)
	tunnel := &Tunnel{
		ID:        "runtime-1",
		ConfigID:  "config-1",
		Alias:     "db",
		LocalAddr: listener.Addr().String(),
		Status:    StatusActive,
		listener:  listener,
	}
	manager.activeTunnels[tunnel.ID] = tunnel

	result, err := manager.CheckTunnelHealth(tunnel.ID)
	if err != nil {
		t.Fatalf("CheckTunnelHealth returned error: %v", err)
	}

	if !result.Healthy {
		t.Fatalf("expected healthy result, got %#v", result)
	}
	if result.LocalListenerStatus != "ok" {
		t.Fatalf("expected local listener status ok, got %q", result.LocalListenerStatus)
	}
	if result.CheckedAt == "" {
		t.Fatal("expected CheckedAt to be set")
	}

	info := manager.GetActiveTunnels()
	if len(info) != 1 {
		t.Fatalf("expected one active tunnel, got %d", len(info))
	}
	if info[0].HealthCheckCount != 1 {
		t.Fatalf("expected health check count 1, got %d", info[0].HealthCheckCount)
	}
	if info[0].LastHealthCheckAt == "" {
		t.Fatal("expected LastHealthCheckAt to be set")
	}
	if info[0].LastHealthCheckError != "" {
		t.Fatalf("expected no health check error, got %q", info[0].LastHealthCheckError)
	}
}

func TestCheckTunnelHealthReportsClosedLocalListener(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to create listener: %v", err)
	}
	localAddr := listener.Addr().String()
	listener.Close()

	manager := NewManager(nil)
	tunnel := &Tunnel{
		ID:        "runtime-1",
		ConfigID:  "config-1",
		Alias:     "db",
		LocalAddr: localAddr,
		Status:    StatusActive,
	}
	manager.activeTunnels[tunnel.ID] = tunnel

	result, err := manager.CheckTunnelHealth(tunnel.ID)
	if err != nil {
		t.Fatalf("CheckTunnelHealth returned error: %v", err)
	}

	if result.Healthy {
		t.Fatalf("expected unhealthy result, got %#v", result)
	}
	if result.LocalListenerStatus != "failed" {
		t.Fatalf("expected local listener status failed, got %q", result.LocalListenerStatus)
	}
	if result.Error == "" {
		t.Fatal("expected error to be set")
	}

	info := manager.GetActiveTunnels()
	if info[0].Status != StatusDisconnected {
		t.Fatalf("expected tunnel to be marked disconnected, got %s", info[0].Status)
	}
	if info[0].LastHealthCheckError == "" {
		t.Fatal("expected LastHealthCheckError to be set")
	}
}
