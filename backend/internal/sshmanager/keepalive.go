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
	// keepAliveRequestTimeout is the timeout for the keep-alive request itself.
	// It must be shorter than SSHKeepAliveInterval.
	keepAliveRequestTimeout = 10 * time.Second
)

// StartKeepAlive periodically sends keep-alive requests to the SSH server
// to actively detect dead connections. If a request fails or times out, it closes the client.
// This should be run in its own goroutine.
// The original implementation was vulnerable to the SendRequest call blocking indefinitely
// in certain network failure scenarios (e.g., a "half-open" connection), which would
// prevent the keep-alive from detecting the dead connection. This version adds a timeout
// to the request itself.
func StartKeepAlive(client *ssh.Client, ctx context.Context) {
	ticker := time.NewTicker(SSHKeepAliveInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			// We run the SendRequest in a separate goroutine so we can time it out.
			// If SendRequest blocks, the original implementation would block this
			// whole keep-alive goroutine, defeating its purpose.
			errC := make(chan error, 1)
			go func() {
				_, _, err := client.SendRequest("keepalive@openssh.com", true, nil)
				errC <- err
			}()

			select {
			case err := <-errC:
				if err != nil {
					log.Printf("SSH keep-alive for client %s failed: %v. Closing connection.", client.RemoteAddr(), err)
					client.Close()
					return
				}
				// Keep-alive successful, continue the loop.
			case <-time.After(keepAliveRequestTimeout):
				log.Printf("SSH keep-alive for client %s timed out after %s. Closing connection.", client.RemoteAddr(), keepAliveRequestTimeout)
				client.Close()
				return
			case <-ctx.Done():
				// The parent context was cancelled (e.g., tunnel is shutting down).
				return
			}
		case <-ctx.Done():
			// The parent context was cancelled.
			return
		}
	}
}
