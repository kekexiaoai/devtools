package main

import (
	"context"
	"embed"
	"fmt"
	"log"
	_runtime "runtime"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var icon []byte
var version = "0.0.0"

const appName = "devtools"

func main() {
	// 创建一个 app 的实例
	app := NewApp()

	// 创建应用主菜单 (跨平台)
	appMenu := menu.NewMenu()
	isMacOS := _runtime.GOOS == "darwin"

	// 如果是 macOS，添加标准的 "Edit" 菜单
	// 这会自动包含剪切、复制、粘贴等所有原生文本编辑功能
	if isMacOS {
		appMenu.Append(menu.AppMenu())
		appMenu.Append(menu.EditMenu())
		appMenu.Append(menu.WindowMenu())
	}

	fileMenu := appMenu.AddSubmenu("File")

	if isMacOS {
		// macOS 的标准退出选项
		fileMenu.AddText("Quit DevTools", keys.CmdOrCtrl("q"), func(_ *menu.CallbackData) {
			runtime.Quit(app.ctx)
		})
	} else {
		// Windows/Linux 的标准退出选项
		fileMenu.AddText("Exit", keys.OptionOrAlt("f4"), func(_ *menu.CallbackData) {
			runtime.Quit(app.ctx)
		})
	}
	// 创建 "View" (视图) 子菜单来处理缩放
	viewMenu := appMenu.AddSubmenu("View")

	// 为 "Zoom Out" (缩小) 添加菜单项和快捷键
	zoomOutAccelerator := keys.CmdOrCtrl("-")
	viewMenu.AddText("Zoom Out", zoomOutAccelerator, func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "zoom_change", "small")
	})

	// 为 "Zoom In" (放大) 添加菜单项和快捷键
	// 注意: '+' 键通常需要 Shift，所以我们绑定 '=' 键，并显示为 '+'
	zoomInAccelerator := keys.CmdOrCtrl("+")
	viewMenu.AddText("Zoom In", zoomInAccelerator, func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "zoom_change", "large")
	})

	// 为 "Actual Size" (重置) 添加菜单项和快捷键
	resetZoomAccelerator := keys.CmdOrCtrl("0")
	viewMenu.AddText("Actual Size", resetZoomAccelerator, func(_ *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "zoom_change", "default")
	})

	// 创建一个 Wails 应用
	err := wails.Run(&options.App{
		Title:     appName,
		Width:     1024,
		Height:    768,
		Frameless: false,
		Menu:      appMenu,

		EnableDefaultContextMenu: true,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},

		BackgroundColour: &options.RGBA{R: 37, G: 37, B: 37, A: 255},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		OnBeforeClose: func(ctx context.Context) (prevent bool) {
			if !isMacOS {
				// 在 Windows 和 Linux 上，允许直接退出
				return false
			}
			// 这个逻辑只在 macOS 上生效
			// 检查通行令牌
			if app.isQuitting {
				// 如果是 ForceQuit 发起的，直接允许退出
				return false
			}

			// 否则，是用户点击 'X'，发送事件并阻止退出
			runtime.EventsEmit(ctx, "app:request-quit")
			return true
		},
		HideWindowOnClose: isMacOS,
		Bind: []any{
			app,
		},
		Mac: &mac.Options{
			TitleBar: &mac.TitleBar{
				TitlebarAppearsTransparent: true,
				HideTitle:                  true,
				HideTitleBar:               false,
				FullSizeContent:            true,
				UseToolbar:                 true,
				HideToolbarSeparator:       false,
			},
			// Appearance: mac.NSAppearanceNameDarkAqua,
			About: &mac.AboutInfo{
				Title:   fmt.Sprintf("%s %s", appName, version),
				Message: "dev tools.\n\nCopyright © 2025",
				Icon:    icon,
			},
			WebviewIsTransparent: false,
			WindowIsTranslucent:  true,
		},
		Windows: &windows.Options{
			WebviewIsTransparent:              false,
			WindowIsTranslucent:               false,
			DisableFramelessWindowDecorations: false,
		},
	})
	if err != nil {
		println("Error:", err.Error())
		log.Fatal(err)
	}
}
