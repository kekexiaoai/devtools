//go:build !windows

package terminal

import (
	"log"
	"os/exec"
	"syscall"
	"time"
)

// terminateProcessGroup attempts to gracefully terminate a process group on Unix-like systems.
// It first sends SIGTERM, waits briefly, and then sends SIGKILL if the process group is still alive.
func terminateProcessGroup(cmd *exec.Cmd) {
	if cmd == nil || cmd.Process == nil {
		return
	}

	pid := cmd.Process.Pid
	pgid, err := syscall.Getpgid(pid)
	if err != nil {
		// If we can't get the pgid, it's likely the process already exited.
		// Fallback to killing the single process, just in case.
		log.Printf("Failed to get pgid for pid %d, process may have already exited: %v", pid, err)
		pgid = pid
	}

	// Send SIGTERM to the entire process group
	log.Printf("Sending SIGTERM to process group %d", pgid)
	_ = syscall.Kill(-pgid, syscall.SIGTERM)

	// Wait a moment for graceful shutdown
	time.Sleep(250 * time.Millisecond)

	// Check if the process group is still alive by sending signal 0.
	// On Unix, this is the standard way to check for process existence.
	if err := syscall.Kill(-pgid, 0); err != nil {
		log.Printf("Process group %d exited gracefully after SIGTERM.", pgid)
		return
	}

	// If the process group is still alive, force kill it with SIGKILL.
	log.Printf("Process group %d did not exit gracefully, sending SIGKILL.", pgid)
	_ = syscall.Kill(-pgid, syscall.SIGKILL)
}
