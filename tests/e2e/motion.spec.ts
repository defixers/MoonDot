import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'

test('页面快速切换、向导返回及减少动态效果不会阻挡交互或保留旧页面', async () => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'moondot-motion-')))
  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
  env.MOONDOT_USER_DATA = directory
  delete env.ELECTRON_RUN_AS_NODE
  let app: ElectronApplication | undefined
  try {
    app = await electron.launch({ args: [resolve('.')], env })
    // Keep the wizard's default project directory inside this isolated test.
    await app.evaluate(({ app }, path) => app.setPath('documents', path), directory)
    const page = await app.firstWindow()
    await expect(page.getByTestId('database-status')).toHaveText('本地数据库已连接')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.evaluate(`(() => {
      window.__motionEvents = []
      const animate = Element.prototype.animate
      Element.prototype.animate = function (frames, options) {
        if (this.dataset.motion) window.__motionEvents.push({ kind: this.dataset.motion, frames })
        return animate.call(this, frames, options)
      }
    })()`)
    for (const name of ['项目', '项目回收站', '设置', '关于与许可', '工作台']) {
      await page.getByRole('link', { name, exact: true }).click()
      await expect(page.locator('.topbar > span').first()).toHaveText(name)
      await expect(page.locator('[data-motion="page"]')).toHaveCount(1)
      await expect(page.locator('[data-motion="page"] h1')).toBeVisible()
    }
    expect(
      await page.evaluate('window.__motionEvents.filter(e => e.kind === "page").length'),
    ).toBeGreaterThanOrEqual(5)
    // Dispatch several navigations before the previous 220 ms transition has finished.
    await page.evaluate(`(async () => {
      for (const href of ['#/projects', '#/trash', '#/settings', '#/projects']) {
        document.querySelector('nav a[href="' + href + '"]').click()
        await new Promise(resolve => setTimeout(resolve, 35))
      }
    })()`)
    await expect(page.getByRole('heading', { name: '项目', exact: true })).toBeVisible()
    await expect(page.locator('[data-motion="page"]')).toHaveCount(1)
    await expect
      .poll(() => page.locator('[data-motion="page"]').evaluate((el) => el.getAnimations().length))
      .toBe(0)
    await expect(page.locator('[data-motion="page"]')).toHaveCSS('transform', 'none')
    await expect(page.locator('[data-motion="page"]')).toHaveCSS('opacity', '1')
    await page.getByRole('button', { name: '创建项目', exact: true }).click()
    await page.getByLabel('项目名称', { exact: true }).fill('动画切换保留输入')
    await page.getByRole('button', { name: '下一步', exact: true }).click()
    await page.getByRole('radio', { name: 'EP', exact: true }).check()
    await page.getByRole('button', { name: '上一步', exact: true }).click()
    await expect(page.getByLabel('项目名称', { exact: true })).toHaveValue('动画切换保留输入')
    expect(
      await page.evaluate(
        'window.__motionEvents.some(e => e.kind === "step" && e.frames[0].transform === "translateX(-12px)")',
      ),
    ).toBe(true)
    await page.keyboard.press('Escape')
    await expect(page.locator('.editor-modal')).not.toBeVisible()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.evaluate('window.__motionEvents = []')
    await page.getByRole('link', { name: '设置', exact: true }).click()
    await page.getByRole('link', { name: '项目', exact: true }).click()
    await page.getByRole('button', { name: '创建项目', exact: true }).click()
    await page.getByLabel('项目名称', { exact: true }).fill('减少动态效果')
    await page.getByRole('button', { name: '下一步', exact: true }).click()
    await expect(page.getByRole('heading', { name: '选择项目类型' })).toBeVisible()
    expect(await page.evaluate('window.__motionEvents')).toEqual([])
    await expect(page.locator('[data-motion="step"]')).toHaveCSS('transform', 'none')
  } finally {
    await app?.close()
    await rm(directory, { recursive: true, force: true })
  }
})
