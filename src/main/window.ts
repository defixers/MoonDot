import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, Menu, screen, type MenuItemConstructorOptions } from 'electron'
import type { createSettingsService } from './services/settings'
import { visibleWindowState } from './infra/window-state'

export function rendererLocation() {
  return !app.isPackaged && process.env.ELECTRON_RENDERER_URL
    ? new URL(process.env.ELECTRON_RENDERER_URL).href
    : pathToFileURL(join(__dirname, '../renderer/index.html')).href
}

export function createMainWindow(
  settings: ReturnType<typeof createSettingsService>,
  report: (error: unknown) => void,
) {
  const state = visibleWindowState(
    settings.getWindow(),
    screen.getAllDisplays().map((display) => display.workArea),
  )
  const window = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 1180,
    minHeight: 760,
    show: false,
    backgroundColor: '#F5F7FB',
    autoHideMenuBar: process.platform !== 'darwin',
    title: '月句 MoonDot',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  if (process.platform !== 'darwin') window.setMenuBarVisibility(false)
  window.once('ready-to-show', () => {
    if (state.maximized) window.maximize()
    window.show()
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => event.preventDefault())
  window.webContents.on('will-redirect', (event) => event.preventDefault())
  window.webContents.on('will-attach-webview', (event) => event.preventDefault())
  let timer: ReturnType<typeof setTimeout> | undefined
  const persist = () => {
    if (window.isDestroyed()) return
    try {
      settings.saveWindow({ ...window.getNormalBounds(), maximized: window.isMaximized() })
    } catch (error) {
      report(error)
    }
  }
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(persist, 250)
  }
  window.on('resize', schedule)
  window.on('move', schedule)
  window.on('maximize', schedule)
  window.on('unmaximize', schedule)
  window.on('close', () => {
    clearTimeout(timer)
    persist()
  })
  window.on('closed', () => clearTimeout(timer))
  void window.loadURL(rendererLocation()).catch(report)
  return window
}

export function installMenu() {
  app.setAboutPanelOptions({
    applicationName: '月句 MoonDot',
    applicationVersion: app.getVersion(),
    copyright: '© 2026 归尘回梦',
    credits: 'MIT License · 完全本地运行',
  })
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [{ role: 'appMenu' as const }]
      : [{ label: '文件', submenu: [{ role: 'quit' as const, label: '退出' }] }]),
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'close', label: '关闭窗口' },
      ],
    },
    { label: '帮助', submenu: [{ label: '关于月句 MoonDot', click: () => app.showAboutPanel() }] },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
