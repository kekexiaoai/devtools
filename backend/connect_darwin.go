//go:build darwin

package backend

import (
	"fmt"
	"os/exec"
)

// ConnectInTerminal 在 macOS 上打开一个新的 Terminal.app 窗口并执行 ssh 命令
func (a *App) ConnectInTerminal(hostAlias string) error {
	// 使用 AppleScript 来控制 Terminal.app
	script := fmt.Sprintf(`tell application "Terminal" to do script "ssh %s"`, hostAlias)

	cmd := exec.Command("osascript", "-e", script)

	// 我们使用 .Run()，因为它会等待命令完成。对于打开新窗口这个操作，它会立即返回。
	err := cmd.Run()
	if err != nil {
		return fmt.Errorf("failed to execute AppleScript to open Terminal: %w", err)
	}

	// 激活 Terminal.app，将其带到前台
	activateCmd := exec.Command("osascript", "-e", `tell application "Terminal" to activate`)
	_ = activateCmd.Run() // 这里的错误我们可以暂时忽略

	return nil
}
