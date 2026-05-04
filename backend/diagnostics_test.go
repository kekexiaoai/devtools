package backend

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestReadLogTailReturnsLastLines(t *testing.T) {
	logPath := filepath.Join(t.TempDir(), "app.log")
	content := "line 1\nline 2\nline 3\nline 4\n"
	if err := os.WriteFile(logPath, []byte(content), 0o600); err != nil {
		t.Fatalf("failed to write log file: %v", err)
	}

	lines, err := readLogTail(logPath, 2)
	if err != nil {
		t.Fatalf("readLogTail returned error: %v", err)
	}

	expected := []string{"line 3", "line 4"}
	if !reflect.DeepEqual(lines, expected) {
		t.Fatalf("expected %v, got %v", expected, lines)
	}
}

func TestReadLogTailReturnsEmptyForMissingFile(t *testing.T) {
	lines, err := readLogTail(filepath.Join(t.TempDir(), "missing.log"), 100)
	if err != nil {
		t.Fatalf("readLogTail returned error: %v", err)
	}
	if len(lines) != 0 {
		t.Fatalf("expected no lines, got %v", lines)
	}
}

func TestDiagnosticsSnapshotUsesConfiguredPaths(t *testing.T) {
	configDir := t.TempDir()
	app := NewApp(true, false)
	app.configDir = configDir
	app.logFilePath = filepath.Join(configDir, "app.log")

	snapshot := app.GetDiagnosticsSnapshot()
	if !snapshot.Debug {
		t.Fatal("expected debug mode")
	}
	if snapshot.ConfigDir != configDir {
		t.Fatalf("expected config dir %q, got %q", configDir, snapshot.ConfigDir)
	}
	if snapshot.LogFilePath != app.logFilePath {
		t.Fatalf("expected log path %q, got %q", app.logFilePath, snapshot.LogFilePath)
	}
}
