import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron'
import log from 'electron-log/main'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { openDatabase } from './db'
import { migrateDatabase } from './db/migrator'
import { applicationPaths, ensureApplicationPaths } from './infra/paths'
import { createSettingsService } from './services/settings'
import { isTrustedDocument, validatedHandler } from './ipc/router'
import { createMainWindow, installMenu, rendererLocation } from './window'
import {
  PROFILE_GET_CHANNEL,
  PROFILE_SAVE_CHANNEL,
  SYSTEM_HEALTH_CHANNEL,
} from '../shared/channels'
import { profileSchema } from '../shared/settings'
import { systemHealthSchema } from '../shared/system'
import { WORK_METHODS, workChannel } from '../shared/channels'
import { workSchemas, type WorkMethod, type WorkInput, type WorkOutputs } from '../shared/work'
import { createWorkService } from './services/work'
import { createFileService } from './services/files'
import { inheritSettings } from './db/inherit-settings'
import { defaultProjectDirectory } from './services/project-paths'

const paths = applicationPaths(
  app.getPath('appData'),
  app.getAppPath(),
  app.isPackaged,
  process.env.MOONDOT_USER_DATA,
)
ensureApplicationPaths(paths)
app.setPath('userData', paths.userData)
// Store packages use the AUMID assigned from their package identity and Application.Id.
if (!process.windowsStore) app.setAppUserModelId('com.moondot.app')
log.transports.file.resolvePathFn = () => join(paths.logs, 'main.log')
log.transports.file.maxSize = 10 * 1024 * 1024
const report = (error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error'
  log.error(message.replaceAll(paths.userData, '<userData>').replaceAll(app.getAppPath(), '<app>'))
}
let database: ReturnType<typeof openDatabase> | undefined
let settings: ReturnType<typeof createSettingsService> | undefined
let mainWindow: BrowserWindow | undefined
let fileService: ReturnType<typeof createFileService> | undefined
let cleanupTimer: ReturnType<typeof setInterval> | undefined
let quitting = false
const showWindow = () => {
  if (!settings) return
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createMainWindow(settings, report)
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showWindow)
  void app
    .whenReady()
    .then(async () => {
      session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
        callback(false),
      )
      session.defaultSession.setPermissionCheckHandler(() => false)
      database = openDatabase(paths.database)
      const migration = await migrateDatabase(database.sqlite, paths.migrationSnapshots)
      log.info('Database ready', { schemaVersion: migration.version })
      inheritSettings(database.sqlite, paths.legacyDatabase)
      settings = createSettingsService(database)
      const service = settings
      const connection = database
      const projects = createWorkService(
        connection.sqlite,
        () => Date.now(),
        (id) => fileService?.busy(id) ?? false,
        () => defaultProjectDirectory(app.getPath('documents')),
        (path) => shell.trashItem(path),
      )
      fileService = createFileService(
        connection.sqlite,
        projects.get,
        {
          chooseDirectory: async () => {
            const selection = await dialog.showOpenDialog(mainWindow!, {
              properties: ['openDirectory', 'createDirectory'],
            })
            return selection.canceled ? null : (selection.filePaths[0] ?? null)
          },
          chooseImports: async (folders) => {
            const selection = await dialog.showOpenDialog(mainWindow!, {
              properties: [folders ? 'openDirectory' : 'openFile', 'multiSelections'],
            })
            return selection.canceled ? [] : selection.filePaths
          },
          trash: (path) => shell.trashItem(path),
          open: (path) => shell.openPath(path),
          reveal: (path) => shell.showItemInFolder(path),
        },
        report,
      )
      const work: {
        [K in WorkMethod]: (input: WorkInput<K>) => WorkOutputs[K] | Promise<WorkOutputs[K]>
      } = { ...projects, ...fileService }
      cleanupTimer = setInterval(() => {
        try {
          projects.cleanup()
        } catch (error) {
          report(error)
        }
      }, 60_000)
      const trusted = (event: Electron.IpcMainInvokeEvent) =>
        !!mainWindow &&
        !mainWindow.isDestroyed() &&
        event.sender === mainWindow.webContents &&
        event.senderFrame === event.sender.mainFrame &&
        isTrustedDocument(event.senderFrame.url, rendererLocation())
      ipcMain.handle(
        SYSTEM_HEALTH_CHANNEL,
        validatedHandler(
          z.undefined(),
          () => {
            const row = connection.db.get<{ version: string }>(
              sql`SELECT sqlite_version() AS version`,
            )
            return systemHealthSchema.parse({
              appVersion: app.getVersion(),
              electronVersion: process.versions.electron,
              sqliteVersion: row.version,
              journalMode: connection.sqlite.pragma('journal_mode', { simple: true }),
              foreignKeys: connection.sqlite.pragma('foreign_keys', { simple: true }) === 1,
              schemaVersion: connection.sqlite.pragma('user_version', { simple: true }),
            })
          },
          trusted,
          report,
        ),
      )
      ipcMain.handle(
        PROFILE_GET_CHANNEL,
        validatedHandler(z.undefined(), () => service.getProfile(), trusted, report),
      )
      ipcMain.handle(
        PROFILE_SAVE_CHANNEL,
        validatedHandler(profileSchema, (input) => service.saveProfile(input), trusted, report),
      )
      const registerWork = <K extends WorkMethod>(method: K) => {
        ipcMain.handle(
          workChannel(method),
          validatedHandler(
            workSchemas[method] as unknown as z.ZodType<WorkInput<K>>,
            (input) => work[method](input),
            trusted,
            report,
          ),
        )
      }
      WORK_METHODS.forEach(registerWork)
      installMenu()
      mainWindow = createMainWindow(service, report)
      app.on('activate', showWindow)
    })
    .catch((error: unknown) => {
      report(error)
      database?.sqlite.close()
      database = undefined
      dialog.showErrorBox(
        '月句启动失败',
        '无法安全打开本地数据库。请保留现有数据与迁移快照，检查日志或使用匹配版本的应用。',
      )
      app.exit(1)
    })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('will-quit', () => {
    clearInterval(cleanupTimer)
    database?.sqlite.close()
    database = undefined
  })
  app.on('before-quit', (event) => {
    if (quitting || !fileService) return
    event.preventDefault()
    quitting = true
    void fileService.dispose().finally(() => app.quit())
  })
}
