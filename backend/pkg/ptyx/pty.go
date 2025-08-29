package ptyx

import (
	"os/exec"
	"runtime"
)

// Command creates a new exec.Cmd for the given shell.
// On Unix-like systems, it adds the "-l" (login) flag to start a login shell,
// which ensures that profile files like ~/.zprofile are loaded.
// On Windows, it creates the command without any extra flags as PowerShell
// does not support the "-l" flag and has its own profile loading mechanism.
func Command(shell string) *exec.Cmd {
	if runtime.GOOS == "windows" {
		return exec.Command(shell)
	}
	return exec.Command(shell, "-l")
}
