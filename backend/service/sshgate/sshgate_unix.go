//go:build !windows

package sshgate

import (
	"fmt"
	"os"
	"syscall"
)

// translateSyscallError is the Unix-specific implementation for translating
// syscall errors into more user-friendly messages.
func translateSyscallError(syscallErr *os.SyscallError, hostIdentifier string) error {
	switch syscallErr.Err {
	case syscall.ECONNREFUSED:
		return fmt.Errorf("connection refused by '%s', check the server's IP/port and firewall", hostIdentifier)
	case syscall.EHOSTUNREACH:
		return fmt.Errorf("no route to host '%s', check your network/VPN and the server's IP", hostIdentifier)
	case syscall.ENETUNREACH:
		return fmt.Errorf("network is unreachable for '%s', check your network connection and VPN", hostIdentifier)
	}
	return nil // Not a syscall error we specifically translate.
}
