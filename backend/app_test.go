package backend

import (
	"testing"
	"time"

	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
)

func TestQuitRequestRequiresSecondRequestWithinWindow(t *testing.T) {
	app := NewApp(true, true)
	now := time.Now()

	if app.shouldQuitImmediately(now) {
		t.Fatal("first quit request should not quit immediately")
	}

	app.quitPromptAt = now
	if !app.shouldQuitImmediately(now.Add(time.Second)) {
		t.Fatal("second quit request during confirmation window should quit")
	}

	if app.shouldQuitImmediately(now.Add(6 * time.Second)) {
		t.Fatal("expired quit confirmation should not quit immediately")
	}
}

func TestOnBeforeCloseDoesNotPreventSystemShutdown(t *testing.T) {
	app := NewApp(true, true)

	if app.OnBeforeClose(nil) {
		t.Fatal("OnBeforeClose should not prevent shutdown or direct close")
	}
}

func TestMacMenuUsesCustomQuitHandler(t *testing.T) {
	app := NewApp(true, true)
	appMenu := menu.NewMenu()

	app.Menu(appMenu)

	if len(appMenu.Items) == 0 {
		t.Fatal("mac menu should not be empty")
	}

	applicationMenu := appMenu.Items[0]
	if applicationMenu.Role == menu.AppMenuRole {
		t.Fatal("mac menu should not use the default AppMenuRole because it owns Command+Q")
	}
	if applicationMenu.Label != "DevTools" {
		t.Fatalf("expected custom application menu label DevTools, got %q", applicationMenu.Label)
	}

	var quitItem *menu.MenuItem
	for _, item := range applicationMenu.SubMenu.Items {
		if item.Label == "Quit DevTools" {
			quitItem = item
			break
		}
	}
	if quitItem == nil {
		t.Fatal("custom application menu should contain Quit DevTools")
	}
	if quitItem.Click == nil {
		t.Fatal("Quit DevTools should use the application quit confirmation handler")
	}
	if quitItem.Accelerator == nil || quitItem.Accelerator.Key != "q" {
		t.Fatalf("Quit DevTools should use Command+Q, got %#v", quitItem.Accelerator)
	}
	if len(quitItem.Accelerator.Modifiers) != 1 || quitItem.Accelerator.Modifiers[0] != keys.CmdOrCtrlKey {
		t.Fatalf("Quit DevTools should use Command+Q, got %#v", quitItem.Accelerator.Modifiers)
	}
}
