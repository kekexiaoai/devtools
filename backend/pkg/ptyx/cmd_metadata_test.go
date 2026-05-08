package ptyx

import (
	"os/exec"
	"syscall"
	"testing"

	gopty "github.com/aymanbagabas/go-pty"
)

func TestCopyExecCmdMetadata(t *testing.T) {
	source := exec.Command("sh", "-c", "echo test")
	source.Dir = "/tmp/devtools"
	source.Env = []string{"TERM=xterm-256color", "FOO=bar"}
	source.SysProcAttr = &syscall.SysProcAttr{}

	target := &gopty.Cmd{}

	copyExecCmdMetadata(target, source)

	if target.Dir != source.Dir {
		t.Fatalf("expected Dir %q, got %q", source.Dir, target.Dir)
	}
	if len(target.Env) != len(source.Env) {
		t.Fatalf("expected Env length %d, got %d", len(source.Env), len(target.Env))
	}
	for i := range source.Env {
		if target.Env[i] != source.Env[i] {
			t.Fatalf("expected Env[%d] %q, got %q", i, source.Env[i], target.Env[i])
		}
	}
	if target.SysProcAttr == nil {
		t.Fatal("expected SysProcAttr to be copied")
	}

	source.Env[0] = "TERM=broken"
	if target.Env[0] != "TERM=xterm-256color" {
		t.Fatalf("expected copied Env to be independent, got %q", target.Env[0])
	}
}
