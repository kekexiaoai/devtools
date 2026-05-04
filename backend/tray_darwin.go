//go:build darwin

package backend

/*
#cgo darwin LDFLAGS: -framework Cocoa

#include <stdint.h>

void setupDevToolsTray(uintptr_t handle);
*/
import "C"

import (
	"log"
	"runtime/cgo"
	"sync"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

var trayHandleMu sync.Mutex

func (a *App) SetupTrayMenu() {
	if !a.isMacOS {
		return
	}

	trayHandleMu.Lock()
	defer trayHandleMu.Unlock()

	if a.trayHandle != 0 {
		return
	}

	handle := cgo.NewHandle(a)
	a.trayHandle = uintptr(handle)
	C.setupDevToolsTray(C.uintptr_t(a.trayHandle))
}

func (a *App) TeardownTrayMenu() {
	trayHandleMu.Lock()
	defer trayHandleMu.Unlock()

	if a.trayHandle == 0 {
		return
	}
	cgo.Handle(a.trayHandle).Delete()
	a.trayHandle = 0
}

func (a *App) showFromTray() {
	if a.ctx == nil {
		log.Println("Tray show ignored because app context is not ready.")
		return
	}
	wailsRuntime.Show(a.ctx)
	wailsRuntime.WindowShow(a.ctx)
	wailsRuntime.WindowUnminimise(a.ctx)
}

//export trayShowWindow
func trayShowWindow(handle C.uintptr_t) {
	app := cgo.Handle(uintptr(handle)).Value().(*App)
	app.showFromTray()
}

//export trayRequestQuit
func trayRequestQuit(handle C.uintptr_t) {
	app := cgo.Handle(uintptr(handle)).Value().(*App)
	app.RequestQuit()
}
