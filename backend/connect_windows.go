//go:build windows

package backend

import (
	"fmt"
	"os/exec"
)

// ConnectInTerminal 在 Windows 上打开一个新的 cmd.exe 窗口并执行 ssh 命令
func (a *App) ConnectInTerminal(hostAlias string) error {
	// `cmd /c start ...` 会在一个新的独立窗口中启动命令
	// `/k` 选项会在命令执行后保持窗口打开，以便用户可以看到输出
	cmd := exec.Command("cmd", "/c", "start", "cmd.exe", "/k", fmt.Sprintf("ssh %s", hostAlias))

	err := cmd.Run()
	if err != nil {
		return fmt.Errorf("failed to start new cmd process: %w", err)
	}

	return nil
}
