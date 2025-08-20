//go:build windows

package ptyx

import (
	"io"
	"os"
	"os/exec"

	gopty "github.com/aymanbagabas/go-pty"
)

type winPty struct {
	p   gopty.Pty
	in  io.WriteCloser
	out io.Reader
	c   *gopty.Cmd
}

func (p *winPty) File() *os.File {
	// On Windows, there is no single file descriptor that can be used for both
	// reading and writing like on Unix. The I/O is handled through separate pipes.
	return nil
}

func (p *winPty) In() io.WriteCloser { return p.in }

func (p *winPty) Out() io.Reader { return p.out }

func (p *winPty) Close() error { return p.p.Close() }

func (p *winPty) Resize(rows, cols uint16) error {
	return p.p.Resize(int(cols), int(rows))
}

func Start(cmd *exec.Cmd) (Pty, error) {
	return StartWithSize(cmd, nil)
}

func StartWithSize(cmd *exec.Cmd, ws *Winsize) (Pty, error) {
	p, err := gopty.New()
	if err != nil {
		return nil, err
	}
	c := p.Command(cmd.Path, cmd.Args[1:]...)
	if err := c.Start(); err != nil {
		p.Close()
		return nil, err
	}
	cmd.Process = c.Process
	if ws != nil {
		p.Resize(int(ws.Cols), int(ws.Rows))
	}

	var in io.WriteCloser
	var out io.Reader

	if cp, ok := any(p).(interface {
		InputPipe() *os.File
		OutputPipe() *os.File
	}); ok {
		in = cp.InputPipe()
		out = cp.OutputPipe()
	} else {
		in = struct {
			io.Writer
			io.Closer
		}{
			Writer: p,
			Closer: p,
		}
		out = p
	}

	return &winPty{c: c, in: in, out: out, p: p}, nil
}
