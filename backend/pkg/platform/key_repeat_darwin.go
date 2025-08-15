//go:build darwin

package platform

import (
	"fmt"
	"log"
	"os/exec"
	"strings"
)

// setupMacOSKeyRepeat enables continuous key press behavior on macOS
// by setting an application-specific default. This avoids forcing users
// to change their global system settings.
func setupMacOSKeyRepeat(name string) {
	// IMPORTANT: Replace this with your application's Bundle Identifier.
	// You can find or set this in your `wails.json` file under the "mac" -> "BundleIdentifier" key.
	// e.g., "com.yourcompany.your-app-name"
	bundleIdentifier := fmt.Sprintf("com.wails.%s", name)

	// 我们使用 `defaults read` 来检查这个值是否已经被设置为 "0" (即 false).
	// 如果已经设置，我们就不需要再做任何事。
	checkCmd := exec.Command("defaults", "read", bundleIdentifier, "ApplePressAndHoldEnabled")
	output, err := checkCmd.Output()

	// 如果 `defaults read` 失败，很可能是因为这个键还不存在，这没关系。
	// 如果它成功了并且输出是 "0\n"，说明按键重复已经为本应用启用了。
	if err == nil && strings.TrimSpace(string(output)) == "0" {
		log.Println("Key repeat is already enabled for this app.")
		return
	}

	// 这个命令会专门为我们的应用开启按键重复。
	cmd := exec.Command("defaults", "write", bundleIdentifier, "ApplePressAndHoldEnabled", "-bool", "false")
	err = cmd.Run()

	if err != nil {
		// 这不是一个致命错误，所以我们只记录日志。
		log.Printf("Could not enable key repeat for the app: %v\n", err)
		log.Println("Users may need to run 'defaults write " + bundleIdentifier + " ApplePressAndHoldEnabled -bool false' manually.")
	} else {
		// 重要提示：这个设置需要应用重启后才能生效。
		// 您可以考虑在首次设置后，通过对话框提示用户重启应用以获得最佳体验。
		log.Println("Successfully enabled key repeat for the app on macOS. A restart of the application is required for the change to take effect.")
	}
}
