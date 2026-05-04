package sshgate

import (
	"os"
	"path/filepath"
	"testing"
)

func TestPreviewSSHConfigImportParsesExternalHosts(t *testing.T) {
	service := newProfileTestService(t)
	configPath := filepath.Join(t.TempDir(), "config")
	if err := os.WriteFile(configPath, []byte(`
Host imported
  HostName 10.0.0.8
  User deploy
  Port 2222

Host *
  User ignored
`), 0o600); err != nil {
		t.Fatalf("failed to write import config: %v", err)
	}

	hosts, err := service.PreviewSSHConfigImport(configPath)
	if err != nil {
		t.Fatalf("PreviewSSHConfigImport returned error: %v", err)
	}

	if len(hosts) != 1 {
		t.Fatalf("expected one importable host, got %#v", hosts)
	}
	if hosts[0].Alias != "imported" || hosts[0].HostName != "10.0.0.8" || hosts[0].User != "deploy" {
		t.Fatalf("unexpected imported host: %#v", hosts[0])
	}
}

func TestDiagnoseSSHHostReportsMissingConfig(t *testing.T) {
	service := newProfileTestService(t)

	result, err := service.DiagnoseSSHHost("missing", "")
	if err != nil {
		t.Fatalf("DiagnoseSSHHost returned error: %v", err)
	}

	if result.Healthy {
		t.Fatal("expected missing host diagnosis to be unhealthy")
	}
	if len(result.Checks) != 1 || result.Checks[0].Name != "config" || result.Checks[0].Status != "failed" {
		t.Fatalf("unexpected checks: %#v", result.Checks)
	}
}
