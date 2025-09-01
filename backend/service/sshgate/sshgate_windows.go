//go:build windows

package sshgate

import (
	"errors"
	"fmt"
	"os"

	"golang.org/x/sys/windows"
)

// translateSyscallError is the Windows-specific implementation for translating
// syscall errors into more user-friendly messages.
func translateSyscallError(syscallErr *os.SyscallError, hostIdentifier string) error {
	// On Windows, network-related errors are often of type WSA...
	// We use errors.Is to check against the sentinel errors defined in the windows package.
	if errors.Is(syscallErr.Err, windows.WSAECONNREFUSED) {
		return fmt.Errorf("connection refused by '%s', check the server's IP/port and firewall", hostIdentifier)
	}
	if errors.Is(syscallErr.Err, windows.WSAEHOSTUNREACH) {
		return fmt.Errorf("no route to host '%s', check your network/VPN and the server's IP", hostIdentifier)
	}
	if errors.Is(syscallErr.Err, windows.WSAENETUNREACH) {
		return fmt.Errorf("network is unreachable for '%s', check your network connection and VPN", hostIdentifier)
	}
	return nil // Not a syscall error we specifically translate.
}
