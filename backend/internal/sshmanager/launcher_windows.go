//go:build windows

package sshmanager

import (
	"os/exec"
	"syscall"
)

func configureTerminalLauncherCommand(cmd *exec.Cmd) {
	if cmd == nil {
		return
	}
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.HideWindow = true
}
