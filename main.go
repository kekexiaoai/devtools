package main

import (
	"context"
	"embed"
	"fmt"
	"log"
	_runtime "runtime"

	"devtools/backend"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var icon []byte
var version = "0.0.0"

const appName = "devtools"

func main() {
	isMacOS := _runtime.GOOS == "darwin"
	// 创建一个 app 的实例
	app := backend.NewApp(IsDebug, isMacOS)

	// 完成所有服务的初始化和注入
	app.Bootstrap()

	// 创建应用主菜单 (跨平台)
	appMenu := menu.NewMenu()

	// 如果是 macOS，添加标准的 "Edit" 菜单
	// 这会自动包含剪切、复制、粘贴等所有原生文本编辑功能
	if isMacOS {
		appMenu.Append(menu.AppMenu())
		appMenu.Append(menu.EditMenu())
		appMenu.Append(menu.WindowMenu())
	}
	app.Menu(appMenu)

	// 解决 Windows 和 macOS 窗口尺寸计算差异问题
	// Windows 的宽度计算包括边框，所以我们需要增加边框宽度以获得期望的内容区宽度
	windowWidth := 1024
	if _runtime.GOOS == "windows" {
		windowWidth += 16 // 补偿 Windows 边框 (通常左右各 8px)
	}

	// 创建一个 Wails 应用
	err := wails.Run(&options.App{
		Title:     appName,
		Width:     windowWidth,
		Height:    768,
		Frameless: false,
		Menu:      appMenu,

		EnableDefaultContextMenu: true,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},

		BackgroundColour: &options.RGBA{R: 37, G: 37, B: 37, A: 255},
		OnStartup: func(ctx context.Context) {
			app.Startup(ctx)
		},
		OnShutdown: func(ctx context.Context) {
			app.Shutdown(ctx)
		},
		OnBeforeClose: app.OnBeforeClose,

		HideWindowOnClose: isMacOS,
		Bind: []any{
			app,
			app.FileSyncService,
			app.SSHGateService,
			app.TerminalService,
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
