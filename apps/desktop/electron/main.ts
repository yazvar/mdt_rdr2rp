import { app, BrowserWindow, ipcMain, safeStorage, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import fs from 'fs'
import path from 'path'

const isDev = !app.isPackaged

function tokenFile(): string {
  return path.join(app.getPath('userData'), 'session.bin')
}

function readToken(): string {
  try {
    if (!fs.existsSync(tokenFile())) return ''
    const data = fs.readFileSync(tokenFile())
    if (safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(data)
    return data.toString('utf8')
  } catch {
    return ''
  }
}

function writeToken(token: string): void {
  const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(token) : Buffer.from(token, 'utf8')
  fs.writeFileSync(tokenFile(), data)
}

function allowedExternal(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
  } catch {
    return false
  }
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#140e0b',
    title: 'Шерифский департамент',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  if (isDev) void window.loadURL('http://localhost:5173')
  else void window.loadFile(path.join(__dirname, '../dist/index.html'))
  return window
}

autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true
autoUpdater.allowDowngrade = false

let pendingVersion = ''
let updateReady = false

function broadcast(payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('update:status', payload)
}

function quietUpdateError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /404|latest\.yml|ENOENT|ENOTFOUND|net::ERR/i.test(message)
}

function feedFrom(apiBase: string): string | null {
  let url: URL
  try {
    url = new URL(apiBase)
  } catch {
    return null
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol === 'https:' || (url.protocol === 'http:' && local)) return `${url.origin}/updates`
  return null
}

autoUpdater.on('update-available', (info) => {
  pendingVersion = info.version
  updateReady = false
  broadcast({ state: 'available', version: info.version })
})
autoUpdater.on('download-progress', (progress) => {
  broadcast({ state: 'downloading', version: pendingVersion, percent: Math.round(progress.percent) })
})
autoUpdater.on('update-downloaded', (info) => {
  updateReady = true
  broadcast({ state: 'ready', version: info.version })
})
autoUpdater.on('error', (error) => {
  if (quietUpdateError(error)) return
  broadcast({ state: 'error', message: 'Не удалось загрузить обновление.' })
})

const locked = app.requestSingleInstanceLock()
if (!locked) app.quit()

app.whenReady().then(() => {
  const window = createWindow()
  app.on('second-instance', () => {
    if (window.isMinimized()) window.restore()
    window.focus()
  })
  ipcMain.handle('token:get', () => readToken())
  ipcMain.handle('token:set', (_event, token: string) => writeToken(token))
  ipcMain.handle('token:clear', () => {
    if (fs.existsSync(tokenFile())) fs.unlinkSync(tokenFile())
  })
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('update:check', async (_event, apiBase: string) => {
    const current = app.getVersion()
    if (!app.isPackaged) return { supported: false, current }
    const feed = feedFrom(typeof apiBase === 'string' ? apiBase : '')
    if (!feed) return { supported: false, current }
    autoUpdater.setFeedURL({ provider: 'generic', url: feed })
    try {
      await autoUpdater.checkForUpdates()
      return { supported: true, current }
    } catch (error) {
      if (quietUpdateError(error)) return { supported: true, current }
      return { supported: true, current, error: 'Не удалось проверить обновление.' }
    }
  })
  ipcMain.handle('update:install', () => {
    if (!updateReady) return false
    setImmediate(() => autoUpdater.quitAndInstall(true, true))
    return true
  })
  ipcMain.handle('shell:open', async (_event, url: string) => {
    if (!allowedExternal(url)) return false
    await shell.openExternal(url)
    return true
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
