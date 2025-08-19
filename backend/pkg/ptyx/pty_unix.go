//go:build !windows

package ptyx

import (
	"io"
	"os"
	"os/exec"

	"github.com/creack/pty"
)

type unixPty struct {
	f *os.File
	c *exec.Cmd
}

func (p *unixPty) File() *os.File { return p.f }

func (p *unixPty) In() io.WriteCloser { return p.f }

func (p *unixPty) Out() io.Reader { return p.f }

func (p *unixPty) Close() error { return p.f.Close() }

func (p *unixPty) Resize(rows, cols uint16) error {
	return pty.Setsize(p.f, &pty.Winsize{
		Rows: rows,
		Cols: cols,
	})
}

func Start(cmd *exec.Cmd) (Pty, error) {
	f, err := pty.Start(cmd)
	return &unixPty{f: f, c: cmd}, err
}

// StartWithSize creates and starts a command with a PTY of a given size.
func StartWithSize(cmd *exec.Cmd, ws *Winsize) (Pty, error) {
	var err error
	var f *os.File
	if ws == nil {
		f, err = pty.Start(cmd)
	} else {
		f, err = pty.StartWithSize(cmd, &pty.Winsize{
			Rows: ws.Rows,
			Cols: ws.Cols,
		})
	}
	if err != nil {
		return nil, err
	}
	return &unixPty{f: f, c: cmd}, nil
}
