package sshmanager

import (
	"context"
	"log"
	"time"

	"golang.org/x/crypto/ssh"
)

const (
	// SSHKeepAliveInterval is the interval for sending SSH keep-alive messages.
	SSHKeepAliveInterval = 15 * time.Second
)

// StartKeepAlive periodically sends keep-alive requests to the SSH server
// to actively detect dead connections. If a request fails, it closes the client.
// This should be run in its own goroutine.
func StartKeepAlive(client *ssh.Client, ctx context.Context) {
	ticker := time.NewTicker(SSHKeepAliveInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			_, _, err := client.SendRequest("keepalive@openssh.com", true, nil)
			if err != nil {
				log.Printf("SSH keep-alive for client %s failed: %v. Closing connection.", client.RemoteAddr(), err)
				client.Close()
				return
			}
		case <-ctx.Done():
			return
		}
	}
}
