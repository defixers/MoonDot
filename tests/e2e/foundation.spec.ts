import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import type { MoonDotApi } from '../../src/shared/system'

async function environment() {
  const directory = await mkdtemp(join(tmpdir(), 'moondot-阶段一-'))
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter((item): item is [string, string] => item[1] !== undefined),
  )
  delete env.ELECTRON_RUN_AS_NODE
  env.MOONDOT_USER_DATA = directory
  return { directory, env }
}

test('设置通过主进程持久化，重启保留窗口状态并展示许可证', async () => {
  const { directory, env } = await environment()
  let application: ElectronApplication | undefined
  try {
    application = await electron.launch({ args: [resolve('.')], env })
    let page = await application.firstWindow()
    await expect(page.getByTestId('database-status')).toHaveText('本地数据库已连接')
    await page.getByRole('link', { name: '跳转到主要内容' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#main-content')).toBeFocused()
    await page.getByRole('link', { name: '设置', exact: true }).click()
    await page.getByLabel('显示名', { exact: true }).fill('月句测试音乐人')
    await page.getByRole('button', { name: '保存设置' }).click()
    await expect(page.getByRole('status')).toHaveText('设置已保存')
    const invalid = await page.evaluate(() =>
      (globalThis as unknown as { moondot: MoonDotApi }).moondot.settings.saveProfile({
        displayName: 'x'.repeat(81),
      }),
    )
    expect(invalid).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } })
    const bounds = await application.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]!
      window.setBounds({ x: 80, y: 80, width: 1200, height: 800 })
      return window.getNormalBounds()
    })
    await application.close()
    application = await electron.launch({ args: [resolve('.')], env })
    page = await application.firstWindow()
    await expect(page.getByRole('heading', { name: '你好，月句测试音乐人' })).toBeVisible()
    expect(
      await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]!.getNormalBounds(),
      ),
    ).toEqual(bounds)
    await page.screenshot({ path: test.info().outputPath('workspace.png') })
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.webContents.setZoomFactor(2),
    )
    await expect.poll(() => page.evaluate<number>('window.innerWidth')).toBeLessThan(800)
    await expect
      .poll(() =>
        page.evaluate<boolean>(
          'document.documentElement.scrollWidth <= document.documentElement.clientWidth',
        ),
      )
      .toBe(true)
    // Electron zoom + CDP full-page capture can crop the bitmap; capture the actual window instead.
    const zoomedImage = await application.evaluate(async ({ BrowserWindow }) =>
      (await BrowserWindow.getAllWindows()[0]!.webContents.capturePage())
        .toPNG()
        .toString('base64'),
    )
    await writeFile(
      test.info().outputPath('workspace-200-percent.png'),
      Buffer.from(zoomedImage, 'base64'),
    )
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.webContents.setZoomFactor(1),
    )
    await page.getByRole('link', { name: '关于与许可' }).click()
    await expect(page.getByTestId('project-license')).toContainText('Permission is hereby granted')
    await expect(page.getByText('Third-Party Notices', { exact: false })).toBeVisible()
    if (process.platform === 'darwin') {
      await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.close())
      expect(
        await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
      ).toBe(0)
      const reopened = application.waitForEvent('window')
      await application.evaluate(({ app }) => app.emit('activate'))
      await expect(
        (await reopened).getByRole('heading', { name: '你好，月句测试音乐人' }),
      ).toBeVisible()
    }
  } finally {
    await application?.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('第二实例退出并唤醒已有窗口，其他窗口不能调用设置 IPC', async () => {
  const { directory, env } = await environment()
  let application: ElectronApplication | undefined
  try {
    application = await electron.launch({ args: [resolve('.')], env })
    const page = await application.firstWindow()
    await expect(page.getByTestId('database-status')).toHaveText('本地数据库已连接')
    const executable = await application.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]!.minimize()
      return process.execPath
    })
    const second = spawn(executable, [resolve('.')], { env, windowsHide: true, stdio: 'ignore' })
    const exitCode = await new Promise<number | null>((resolveExit, reject) => {
      const timer = setTimeout(() => {
        second.kill()
        reject(new Error('Second instance did not exit'))
      }, 10_000)
      second.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      second.once('exit', (code) => {
        clearTimeout(timer)
        resolveExit(code)
      })
    })
    expect(exitCode).toBe(0)
    await expect
      .poll(() =>
        application!.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]!.isMinimized(),
        ),
      )
      .toBe(false)
    const denied = await application.evaluate(async ({ BrowserWindow, app }) => {
      const { join } = process.getBuiltinModule('node:path')
      const foreign = new BrowserWindow({
        show: false,
        webPreferences: {
          preload: join(app.getAppPath(), 'out/preload/index.js'),
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
        },
      })
      try {
        await foreign.loadURL('data:text/html,<title>Untrusted frame</title>')
        return await foreign.webContents.executeJavaScript('window.moondot.settings.getProfile()')
      } finally {
        foreign.destroy()
      }
    })
    expect(denied).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
    expect(
      await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
    ).toBe(1)
  } finally {
    await application?.close()
    await rm(directory, { recursive: true, force: true })
  }
})
