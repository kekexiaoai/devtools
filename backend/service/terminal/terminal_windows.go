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
// For Windows, we don't need to set any special attributes. The ConPTY API
// used by the pty library handles window visibility and process management.
// Setting HideWindow here would actually conflict with ConPTY and cause
// the pty to fail to start.
func sysProcAttr() *syscall.SysProcAttr {
	return nil
}
