//go:build !windows

package sshmanager

import "os/exec"

func configureTerminalLauncherCommand(cmd *exec.Cmd) {
	_ = cmd
}
