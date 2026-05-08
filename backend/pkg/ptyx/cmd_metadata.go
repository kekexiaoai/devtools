package ptyx

import (
	"os/exec"

	gopty "github.com/aymanbagabas/go-pty"
)

func copyExecCmdMetadata(target *gopty.Cmd, source *exec.Cmd) {
	if target == nil || source == nil {
		return
	}

	target.Dir = source.Dir
	if source.Env != nil {
		target.Env = append([]string(nil), source.Env...)
	}
	if source.SysProcAttr != nil {
		attrCopy := *source.SysProcAttr
		target.SysProcAttr = &attrCopy
	}
}
