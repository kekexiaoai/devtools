package ptyx

import (
	"io"
	"os"
)

// Pty is a cross-platform abstraction for a pseudo-terminal.
type Pty interface {
	// File returns the underlying PTY file. On Unix, this is the PTY master.
	// On Windows, this returns nil as there is no single file for I/O.
	File() *os.File

	Resize(rows, cols uint16) error

	In() io.WriteCloser

	Out() io.Reader

	Close() error
}

// Winsize is a cross-platform terminal size definition.
type Winsize struct {
	Rows uint16
	Cols uint16
}
