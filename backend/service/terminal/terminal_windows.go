//go:build windows

package terminal

import (
	"fmt"
	"log"
	"os/exec"
	"syscall"
)

// terminateProcessGroup terminates a process and its entire tree on Windows.
// It uses the `taskkill` command, which is the standard way to achieve this.
func terminateProcessGroup(cmd *exec.Cmd) {
	if cmd == nil || cmd.Process == nil {
		return
	}

	pid := cmd.Process.Pid
	log.Printf("Sending taskkill to process tree with PID %d on Windows", pid)

	// /T terminates the specified process and any child processes which were started by it.
	// /F forcefully terminates the process(es).
	killCmd := exec.Command("taskkill", "/F", "/T", "/PID", fmt.Sprintf("%d", pid))
	_ = killCmd.Run()
}

// sysProcAttr returns the syscall.SysProcAttr for Windows.
// On Windows, when running a GUI application (like a Wails app),
// spawning a console subprocess (like powershell.exe) can cause a
// fleeting console window to appear. Setting HideWindow to true
// prevents this, which is crucial for a seamless user experience and
// can prevent certain initialization issues with the pseudo-terminal.
func sysProcAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{
		HideWindow: true,
	}
}
