package main

import (
	"sync"

	"fyne.io/systray"
	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"voltui/internal/config"
)

type desktopTray struct {
	end      func()
	openItem *systray.MenuItem
	quitItem *systray.MenuItem
	once     sync.Once
}

func (a *App) startTray() {
	if !traySupported() {
		return
	}
	a.mu.Lock()
	if a.tray != nil {
		a.mu.Unlock()
		return
	}
	t := &desktopTray{}
	a.tray = t
	a.mu.Unlock()

	t.end = startDesktopTray(func() {
		brandIcon := a.brandIconBytes()
		if brandIcon != nil {
			systray.SetIcon(brandIcon)
		} else {
			systray.SetIcon(trayIconBytes)
		}
		brandName := "VoltUI"
		if cfg, err := config.Load(); err == nil {
			brandName = cfg.BrandName()
		}
		systray.SetTitle(brandName)
		systray.SetTooltip(brandName)
		systray.SetOnTapped(func() { a.showFromTray() })

		labels := trayMenuLabels(a.trayLocale())
		t.openItem = systray.AddMenuItem(labels.openTitle, labels.openTooltip)
		t.quitItem = systray.AddMenuItem(labels.quitTitle, labels.quitTooltip)

		a.mu.Lock()
		a.trayReady = true
		a.mu.Unlock()

		go func() {
			for range t.openItem.ClickedCh {
				a.showFromTray()
			}
		}()
		go func() {
			for range t.quitItem.ClickedCh {
				a.quitFromTray()
			}
		}()
	}, func() {
		a.mu.Lock()
		a.trayReady = false
		a.mu.Unlock()
	})
}

func (a *App) stopTray() {
	a.mu.RLock()
	t := a.tray
	a.mu.RUnlock()
	if t == nil || t.end == nil {
		return
	}
	t.once.Do(t.end)
}

func (a *App) updateTrayLocale(locale string) {
	a.mu.RLock()
	t := a.tray
	a.mu.RUnlock()
	if t == nil || t.openItem == nil || t.quitItem == nil {
		return
	}
	labels := trayMenuLabels(locale)
	t.openItem.SetTitle(labels.openTitle)
	t.openItem.SetTooltip(labels.openTooltip)
	t.quitItem.SetTitle(labels.quitTitle)
	t.quitItem.SetTooltip(labels.quitTooltip)
}

func (a *App) trayLocale() string {
	cfg, _, err := a.loadDesktopUserConfigForEdit()
	if err != nil {
		return ""
	}
	return cfg.DesktopLanguage()
}

func (a *App) showFromTray() {
	ctx := a.ctx
	if ctx == nil {
		return
	}
	wruntime.Show(ctx)
	wruntime.WindowShow(ctx)
	wruntime.WindowUnminimise(ctx)
}

func (a *App) quitFromTray() {
	a.quitApp()
}

type trayLabels struct {
	openTitle   string
	openTooltip string
	quitTitle   string
	quitTooltip string
}

func trayMenuLabels(locale string) trayLabels {
	brandName := "VoltUI"
	if cfg, err := config.Load(); err == nil {
		brandName = cfg.BrandName()
	}
	if locale == "zh" {
		return trayLabels{
			openTitle:   "打开",
			openTooltip: "打开 " + brandName + " 窗口",
			quitTitle:   "退出",
			quitTooltip: "退出 " + brandName,
		}
	}
	return trayLabels{
		openTitle:   "Open",
		openTooltip: "Open the " + brandName + " window",
		quitTitle:   "Quit",
		quitTooltip: "Quit " + brandName,
	}
}
