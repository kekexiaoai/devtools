//go:build !darwin

package backend

func (a *App) SetupTrayMenu() {}

func (a *App) TeardownTrayMenu() {}
