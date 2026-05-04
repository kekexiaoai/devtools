package sshgate

import (
	"fmt"
	"net"
	"path/filepath"
	"testing"

	"devtools/backend/internal/sshtunnel"
)

func newPreflightTestService(t *testing.T, tunnel sshtunnel.SavedTunnelConfig) *Service {
	t.Helper()

	service := NewService(nil)
	service.tunnelsConfigPath = filepath.Join(t.TempDir(), "tunnels.json")
	service.tunnelsConfig = &TunnelsConfig{Tunnels: []sshtunnel.SavedTunnelConfig{tunnel}}
	return service
}

func TestRunTunnelPreflightReportsMissingConfig(t *testing.T) {
	service := NewService(nil)

	result, err := service.RunTunnelPreflight("missing", "")
	if err != nil {
		t.Fatalf("RunTunnelPreflight returned error: %v", err)
	}

	if result.Healthy {
		t.Fatal("expected missing config preflight to be unhealthy")
	}
	if len(result.Checks) != 1 || result.Checks[0].Name != "config" || result.Checks[0].Status != "failed" {
		t.Fatalf("unexpected checks: %#v", result.Checks)
	}
}

func TestRunTunnelPreflightReportsOccupiedLocalPort(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to create listener: %v", err)
	}
	defer listener.Close()

	_, port, err := net.SplitHostPort(listener.Addr().String())
	if err != nil {
		t.Fatalf("failed to split listener addr: %v", err)
	}

	service := newPreflightTestService(t, sshtunnel.SavedTunnelConfig{
		ID:         "db",
		Name:       "Database",
		TunnelType: "local",
		LocalPort:  mustAtoi(t, port),
		HostSource: "ssh_config",
		HostAlias:  "bastion",
		RemoteHost: "localhost",
		RemotePort: 5432,
	})

	result, err := service.RunTunnelPreflight("db", "")
	if err != nil {
		t.Fatalf("RunTunnelPreflight returned error: %v", err)
	}

	localCheck := findPreflightCheck(result.Checks, "local_port")
	if localCheck == nil {
		t.Fatalf("expected local_port check, got %#v", result.Checks)
	}
	if localCheck.Status != "failed" {
		t.Fatalf("expected local port check to fail, got %#v", localCheck)
	}
	if result.Healthy {
		t.Fatal("expected occupied port preflight to be unhealthy")
	}
}

func TestRunTunnelPreflightSkipsDynamicRemoteTarget(t *testing.T) {
	service := newPreflightTestService(t, sshtunnel.SavedTunnelConfig{
		ID:         "socks",
		Name:       "SOCKS",
		TunnelType: "dynamic",
		LocalPort:  0,
		HostSource: "ssh_config",
		HostAlias:  "bastion",
	})

	result, err := service.RunTunnelPreflight("socks", "")
	if err != nil {
		t.Fatalf("RunTunnelPreflight returned error: %v", err)
	}

	remoteCheck := findPreflightCheck(result.Checks, "remote_target")
	if remoteCheck == nil {
		t.Fatalf("expected remote_target check, got %#v", result.Checks)
	}
	if remoteCheck.Status != "skipped" {
		t.Fatalf("expected remote target check to be skipped, got %#v", remoteCheck)
	}
}

func findPreflightCheck(checks []TunnelPreflightCheck, name string) *TunnelPreflightCheck {
	for i := range checks {
		if checks[i].Name == name {
			return &checks[i]
		}
	}
	return nil
}

func mustAtoi(t *testing.T, value string) int {
	t.Helper()
	var result int
	if _, err := fmt.Sscanf(value, "%d", &result); err != nil {
		t.Fatalf("failed to parse port %q: %v", value, err)
	}
	return result
}
