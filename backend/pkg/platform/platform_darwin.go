//go:build darwin
// +build darwin

package platform

func SetupPlatformSpecifics(appName string) {
	setupMacOSKeyRepeat(appName)
}
