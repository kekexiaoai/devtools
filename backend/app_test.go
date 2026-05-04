package backend

import (
	"testing"
	"time"
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
