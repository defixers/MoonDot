import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import { phases } from '../../src/shared/work'
import type { MoonDotApi } from '../../src/shared/system'

async function environment() {
  // Match the canonical paths displayed by the app (macOS /var resolves to /private/var).
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'moondot-remake-ui-')))
  const env = Object.fromEntries(
    Object.entries(process.env).filter((item): item is [string, string] => item[1] !== undefined),
  )
  env.MOONDOT_USER_DATA = directory
  delete env.ELECTRON_RUN_AS_NODE
  const projects = join(directory, 'projects')
  await mkdir(projects)
  return { directory, projects, env }
}
async function selectPaths(app: ElectronApplication, paths: string[]) {
  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = async () => ({ canceled: !paths.length, filePaths: paths })
  }, paths)
}
async function launch(env: Record<string, string>, directory: string) {
  const documents = join(directory, 'Documents')
  await mkdir(documents, { recursive: true })
  const application = await electron.launch({ args: [resolve('.')], env })
  await application.evaluate(({ app }, path) => app.setPath('documents', path), documents)
  return application
}
async function openWizard(page: Page, name: string) {
  await page.getByRole('link', { name: '项目', exact: true }).click()
  await page.getByRole('button', { name: '创建项目', exact: true }).click()
  await page.getByLabel('项目名称', { exact: true }).fill(name)
}
const next = (page: Page) => page.getByRole('button', { name: '下一步', exact: true }).click()
test('真实系统回收站移除项目目录及嵌套文件', async () => {
  const { directory, projects, env } = await environment()
  let app: ElectronApplication | undefined
  try {
    app = await launch(env, directory)
    const page = await app.firstWindow()
    await expect(page.getByTestId('database-status')).toHaveText('本地数据库已连接')
    await openWizard(page, '系统删除验证')
    await skipToConfirmation(page)
    await selectPaths(app, [projects])
    await page.getByRole('button', { name: '更改位置' }).click()
    await page.getByRole('button', { name: '确认创建' }).click()
    await expect(page.getByRole('heading', { name: '系统删除验证', exact: true })).toBeVisible()
    const root = join(projects, '系统删除验证')
    await writeFile(join(root, phases[0]!.folder, 'test.txt'), 'temporary deletion fixture')
    await page.getByRole('button', { name: '删除项目', exact: true }).click()
    await page.getByRole('button', { name: '确认删除项目' }).click()
    await page.getByRole('link', { name: '项目回收站', exact: true }).click()
    await page.getByRole('button', { name: '删除本地项目文件', exact: true }).click()
    await page.getByLabel('确认项目名称').fill('系统删除验证')
    await page.getByRole('button', { name: '确认移入系统回收站并删除记录' }).click()
    await expect(page.getByText('回收站为空', { exact: true })).toBeVisible()
    expect(await readdir(projects)).toEqual([])
  } finally {
    await app?.close()
    await rm(directory, { recursive: true, force: true })
  }
})
test('回收站删除本地项目：名称确认、取消、系统失败保留及重试成功', async () => {
  const { directory, projects, env } = await environment()
  let app: ElectronApplication | undefined
  try {
    app = await launch(env, directory)
    const page = await app.firstWindow()
    await expect(page.getByTestId('database-status')).toHaveText('本地数据库已连接')
    await openWizard(page, '本地删除测试')
    await skipToConfirmation(page)
    await selectPaths(app, [projects])
    await page.getByRole('button', { name: '更改位置' }).click()
    await page.getByRole('button', { name: '确认创建' }).click()
    await expect(page.getByRole('heading', { name: '本地删除测试', exact: true })).toBeVisible()
    const projectRoot = join(projects, '本地删除测试')
    await writeFile(join(projectRoot, 'music.wav'), 'music')
    await writeFile(join(projects, 'keep.txt'), 'keep')
    await page.getByRole('button', { name: '删除项目', exact: true }).click()
    await page.getByRole('button', { name: '确认删除项目' }).click()
    await page.getByRole('link', { name: '项目回收站', exact: true }).click()
    await page.getByRole('button', { name: '删除本地项目文件', exact: true }).click()
    const modal = page.locator('.n-modal')
    const confirm = page.getByRole('button', { name: '确认移入系统回收站并删除记录' })
    await expect(modal).toContainText(projectRoot)
    await expect(confirm).toBeDisabled()
    await page.getByLabel('确认项目名称').fill('wrong')
    await expect(confirm).toBeDisabled()
    await page.getByRole('button', { name: '取消', exact: true }).click()
    expect(await readFile(join(projectRoot, 'music.wav'), 'utf8')).toBe('music')
    await page.getByRole('button', { name: '删除本地项目文件', exact: true }).click()
    await page.getByLabel('确认项目名称').fill('本地删除测试')
    await app.evaluate(({ shell }) => {
      shell.trashItem = async () => {
        throw new Error('trash unavailable')
      }
    })
    await confirm.click()
    await expect(modal).toContainText('无法移入系统回收站')
    expect(await readFile(join(projectRoot, 'music.wav'), 'utf8')).toBe('music')
    await app.evaluate(({ shell }) => {
      shell.trashItem = async () => {}
    })
    await confirm.click()
    await expect(modal).toContainText('项目目录仍然存在')
    expect(await readFile(join(projectRoot, 'music.wav'), 'utf8')).toBe('music')
    const destination = join(directory, 'simulated-system-trash')
    await app.evaluate(({ shell }, destination) => {
      shell.trashItem = async (path) => {
        await process.getBuiltinModule('fs').promises.rename(path, destination)
      }
    }, destination)
    await confirm.click()
    await expect(page.getByText('回收站为空', { exact: true })).toBeVisible()
    await expect(modal).not.toBeVisible()
    await expect(readFile(join(projectRoot, 'music.wav'))).rejects.toThrow()
    expect(await readFile(join(destination, 'music.wav'), 'utf8')).toBe('music')
    expect(await readFile(join(projects, 'keep.txt'), 'utf8')).toBe('keep')
  } finally {
    await app?.close()
    await rm(directory, { recursive: true, force: true })
  }
})
async function skipToConfirmation(page: Page) {
  await next(page)
  await page.getByRole('radio', { name: '单曲', exact: true }).check()
  await next(page)
  await next(page)
  await next(page)
}
test('五步向导、编辑、人员搜索、完成状态、重启和失联目录恢复', async () => {
  test.setTimeout(90000)
  const { directory, projects, env } = await environment()
  let app: ElectronApplication | undefined
  try {
    app = await launch(env, directory)
    let page = await app.firstWindow()
    await expect(page.getByTestId('database-status')).toHaveText('本地数据库已连接')
    await openWizard(page, '夏日回声计划')
    await page.getByLabel('项目备注（选填）').fill('回声里的夏天，先确定创作方向')
    await next(page)
    await expect(page.getByRole('button', { name: '下一步', exact: true })).toBeDisabled()
    await page.getByRole('radio', { name: 'EP', exact: true }).check()
    await page.getByRole('button', { name: '上一步' }).click()
    await expect(page.getByLabel('项目名称', { exact: true })).toHaveValue('夏日回声计划')
    await expect(page.getByLabel('项目备注（选填）')).toHaveValue('回声里的夏天，先确定创作方向')
    await next(page)
    await next(page)
    await page.locator('.stage-section summary').filter({ hasText: '策划与统筹' }).click()
    await page.getByLabel('制作人', { exact: true }).fill('林深，阿海')
    await next(page)
    await page.getByLabel('策划与统筹交付日期').fill('2026-12-01')
    await page.getByLabel('策划与统筹交付日期').press('Tab')
    await page.getByLabel('项目截止日期').fill('2026-12-31')
    await page.getByLabel('项目截止日期').press('Tab')
    await next(page)
    await expect(page.getByRole('button', { name: '确认创建' })).toBeEnabled()
    await selectPaths(app, [projects])
    await page.getByRole('button', { name: '更改位置' }).click()
    await page.screenshot({ path: test.info().outputPath('wizard.png') })
    await page.getByRole('button', { name: '确认创建' }).click()
    await expect(page.getByRole('heading', { name: '夏日回声计划', exact: true })).toBeVisible()
    const root = join(projects, '夏日回声计划')
    expect(await readdir(root)).toEqual(phases.map((phase) => phase.folder))
    await page.getByRole('button', { name: '标记为已完成' }).click()
    await expect(page.getByRole('button', { name: '重新打开项目' })).toBeVisible()
    await page.getByRole('button', { name: '编辑项目', exact: true }).click()
    await page.getByLabel('项目名称', { exact: true }).fill('夏日回声')
    for (let step = 0; step < 4; step++) await next(page)
    await page.getByRole('button', { name: '保存修改' }).click()
    await expect(page.getByRole('heading', { name: '夏日回声', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '重新打开项目' })).toBeVisible()
    await app.close()
    app = await launch(env, directory)
    page = await app.firstWindow()
    await page.getByRole('link', { name: '打开项目 夏日回声', exact: true }).click()
    await expect(page.getByRole('button', { name: '重新打开项目' })).toBeVisible()
    await expect(page.locator('.phase-tabs')).toContainText('2026-12-01')
    await expect(page.locator('.directory-bar')).toContainText(root)
    await page.getByRole('button', { name: /搜索项目、备注与人员/ }).click()
    await page.getByLabel('搜索关键词').fill('林深')
    await page.locator('.search-results button').filter({ hasText: '夏日回声' }).click()
    await expect(page.locator('.search-modal')).toBeHidden()
    await page.screenshot({ path: test.info().outputPath('project.png') })
    await page.getByRole('button', { name: '重新打开项目' }).click()
    await expect(page.getByRole('button', { name: '标记为已完成' })).toBeVisible()
    await page.getByRole('button', { name: '删除项目', exact: true }).click()
    await page.getByRole('button', { name: '确认删除项目' }).click()
    await page.getByRole('link', { name: '项目回收站', exact: true }).click()
    const moved = join(projects, '重新定位的工程')
    await rename(root, moved)
    await page.getByRole('button', { name: '恢复项目', exact: true }).click()
    await expect(page.getByRole('button', { name: '重新定位并恢复' })).toBeVisible()
    await selectPaths(app, [moved])
    await page.getByRole('button', { name: '重新定位并恢复' }).click()
    await expect(page.getByText('回收站为空', { exact: true })).toBeVisible()
    await page.getByRole('link', { name: '项目', exact: true }).click()
    await page.getByRole('link', { name: '打开项目 夏日回声', exact: true }).click()
    await expect(page.locator('.directory-bar')).toContainText(moved)
    const obsolete = await page.evaluate(() => {
      const api = (globalThis as unknown as { moondot: MoonDotApi }).moondot.work
      return ['tasks', 'templates', 'stageState', 'preferences'].filter((key) => key in api)
    })
    expect(obsolete).toEqual([])
  } finally {
    await app?.close()
    await rm(directory, { recursive: true, force: true })
  }
})
test('跳过人员和日期创建，导入冲突、文件夹结构、重命名和外部刷新', async () => {
  test.setTimeout(90000)
  const { directory, projects, env } = await environment()
  let app: ElectronApplication | undefined
  try {
    app = await launch(env, directory)
    const page = await app.firstWindow()
    await expect(page.getByTestId('database-status')).toHaveText('本地数据库已连接')
    await openWizard(page, '空白创作')
    await skipToConfirmation(page)
    await selectPaths(app, [])
    await page.getByRole('button', { name: '更改位置' }).click()
    await expect(page.getByLabel('项目存放位置', { exact: true })).toHaveValue(
      join(directory, 'Documents', 'moondot'),
    )
    await expect(page.getByRole('button', { name: '确认创建' })).toBeEnabled()
    await selectPaths(app, [projects])
    await page.getByRole('button', { name: '更改位置' }).click()
    await page.getByRole('button', { name: '确认创建' }).click()
    await expect(page.getByRole('heading', { name: '空白创作', exact: true })).toBeVisible()
    const stage = join(projects, '空白创作', phases[0].folder)
    const source = join(directory, 'demo.wav')
    await writeFile(source, 'waveform')
    await selectPaths(app, [source])
    await page.getByRole('button', { name: '添加文件', exact: true }).click()
    await expect(page.locator('.file-name')).toContainText('demo.wav')
    await page.getByRole('button', { name: '添加文件', exact: true }).click()
    await expect(page.locator('.file-name').filter({ hasText: 'demo (1).wav' })).toBeVisible()
    await expect(page.getByLabel('遇到同名')).toHaveCount(0)
    await page.getByRole('button', { name: '添加文件', exact: true }).click()
    await expect(page.locator('.file-name').filter({ hasText: 'demo (2).wav' })).toBeVisible()
    const dropped = join(directory, 'drop.txt')
    await writeFile(dropped, 'drag and drop')
    await page.evaluate(
      `document.body.insertAdjacentHTML('beforeend', '<input id="drop-fixture" type="file" hidden />')`,
    )
    await page.locator('#drop-fixture').setInputFiles(dropped)
    await page.evaluate(`(() => {
      const transfer = new DataTransfer()
      transfer.items.add(document.querySelector('#drop-fixture').files[0])
      document.querySelector('.file-surface').dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }))
      document.querySelector('#drop-fixture').remove()
    })()`)
    await expect(page.locator('.file-name').filter({ hasText: 'drop.txt' })).toBeVisible()
    const folder = join(directory, '音频素材')
    await mkdir(join(folder, 'nested'), { recursive: true })
    await writeFile(join(folder, 'nested', 'take.wav'), 'take')
    await selectPaths(app, [folder])
    await page.getByRole('button', { name: '导入文件夹', exact: true }).click()
    await expect(page.locator('.file-name').filter({ hasText: '音频素材' })).toBeVisible()
    expect(await readFile(join(stage, '音频素材/nested/take.wav'), 'utf8')).toBe('take')
    await page.getByRole('button', { name: '重命名 demo.wav', exact: true }).click()
    await page.getByLabel('名称', { exact: true }).fill('renamed.wav')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.locator('.file-name').filter({ hasText: 'renamed.wav' })).toBeVisible()
    await writeFile(join(stage, '外部放入.txt'), 'external')
    await expect(page.locator('.file-name').filter({ hasText: '外部放入.txt' })).toBeVisible({
      timeout: 15000,
    })
    await page.screenshot({ path: test.info().outputPath('files.png') })
    const addedBefore = await page
      .locator('.file-row')
      .filter({ hasText: '外部放入.txt' })
      .locator(':scope > span')
      .nth(1)
      .innerText()
    await page.getByRole('button', { name: '刷新', exact: true }).click()
    await expect(
      page.locator('.file-row').filter({ hasText: '外部放入.txt' }).locator(':scope > span').nth(1),
    ).toHaveText(addedBefore, { useInnerText: true })
    await app.evaluate(({ shell }) => {
      shell.trashItem = async () => {
        throw new Error('Test: trash unsupported')
      }
    })
    await page.getByRole('button', { name: '删除 renamed.wav', exact: true }).click()
    await page.getByRole('button', { name: '确认移入系统回收站' }).click()
    await expect(page.locator('.n-modal')).toContainText('无法移入系统回收站')
    expect(await readFile(join(stage, 'renamed.wav'), 'utf8')).toBe('waveform')
    await page.getByRole('button', { name: '取消', exact: true }).click()
    await page.getByRole('button', { name: '新建子文件夹' }).click()
    await page.getByLabel('名称', { exact: true }).fill('草稿')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await page.getByRole('button', { name: '草稿', exact: true }).click()
    await expect(page.getByText('文件夹为空', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '返回上级' }).click()
    await page.getByRole('button', { name: '删除项目', exact: true }).click()
    await page.getByRole('button', { name: '确认删除项目' }).click()
    await page.getByRole('link', { name: '项目回收站', exact: true }).click()
    await page.getByRole('button', { name: '永久删除记录' }).click()
    await page.getByLabel('确认项目名称').fill('空白创作')
    await page.getByRole('button', { name: '确认永久删除记录' }).click()
    await expect(page.getByText('回收站为空', { exact: true })).toBeVisible()
    expect(await readFile(join(stage, 'renamed.wav'), 'utf8')).toBe('waveform')
  } finally {
    await app?.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('10 MB 封面、现代类型选择、人员校验、默认文档目录和稳定阶段切换', async () => {
  test.setTimeout(90000)
  const { directory, env } = await environment()
  let app: ElectronApplication | undefined
  try {
    app = await launch(env, directory)
    const page = await app.firstWindow()
    await expect(page.getByTestId('database-status')).toHaveText('本地数据库已连接')
    await openWizard(page, '默认位置项目')
    await expect(page.getByLabel('项目名称', { exact: true })).not.toHaveAttribute('placeholder')
    await page.screenshot({ path: test.info().outputPath('cover-empty.png') })
    const png = await readFile(resolve('docs/ui/dashboard.png'))
    const transfer = await page.evaluateHandle(
      (bytes) => {
        const browser = globalThis as unknown as {
          DataTransfer: new () => { items: { add(file: File): void } }
        }
        const data = new browser.DataTransfer()
        data.items.add(new File([new Uint8Array(bytes)], 'drag-cover.png', { type: 'image/png' }))
        return data
      },
      [...png],
    )
    await page.locator('.cover-upload').dispatchEvent('drop', { dataTransfer: transfer })
    await expect(page.locator('.cover-file')).toContainText('drag-cover.png')
    await transfer.dispose()
    const tenMiB = Buffer.alloc(10 * 1024 * 1024)
    png.copy(tenMiB)
    await page
      .getByLabel('项目封面（选填）')
      .setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: tenMiB })
    await expect(page.locator('.cover-preview')).toBeVisible()
    await expect(page.locator('.cover-file')).toContainText('large.png')
    await page.getByRole('button', { name: '移除封面', exact: true }).click()
    await expect(page.locator('.cover-preview')).toHaveCount(0)
    await page
      .getByLabel('项目封面（选填）')
      .setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: tenMiB })
    await expect(page.locator('.cover-preview')).toBeVisible()
    await page.screenshot({ path: test.info().outputPath('cover-selected.png') })
    await expect(page.getByRole('button', { name: '下一步', exact: true })).toBeEnabled()
    await page.getByLabel('项目封面（选填）').setInputFiles({
      name: 'too-large.png',
      mimeType: 'image/png',
      buffer: Buffer.concat([tenMiB, Buffer.alloc(1)]),
    })
    await expect(page.getByRole('alert')).toContainText('10 MB')
    await next(page)
    await page.getByRole('radio', { name: '单曲', exact: true }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('radio', { name: '专辑', exact: true })).toBeChecked()
    await page.screenshot({ path: test.info().outputPath('types.png') })
    await next(page)
    await page.locator('.stage-section summary').filter({ hasText: '策划与统筹' }).click()
    const personnel = page.getByLabel('制作人', { exact: true })
    await expect(personnel).toHaveCSS('resize', 'none')
    await personnel.fill('人'.repeat(121))
    await expect(personnel).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByRole('button', { name: '下一步', exact: true })).toBeDisabled()
    await personnel.fill('林\u202e深')
    await expect(page.getByText('姓名不能包含控制字符或隐藏格式字符')).toBeVisible()
    await personnel.fill('林深，林深，阿海')
    await expect(
      page.locator('.stage-section summary').filter({ hasText: '策划与统筹' }),
    ).toContainText('2 人')
    await next(page)
    await page.getByRole('button', { name: '上一步' }).click()
    await expect(personnel).toHaveValue('林深，林深，阿海')
    await next(page)
    await page.getByLabel('创作交付日期', { exact: true }).click()
    await page.getByText('一周后', { exact: true }).click()
    await expect(page.getByLabel('创作交付日期', { exact: true })).not.toHaveValue('')
    await page.getByLabel('项目截止日期').fill('2027-01-01')
    await page.getByLabel('项目截止日期').press('Tab')
    await page.getByRole('heading', { name: '留出从容创作的时间' }).click()
    await expect(page.locator('.n-date-panel:visible')).toHaveCount(0)
    await page.screenshot({ path: test.info().outputPath('dates.png'), animations: 'disabled' })
    await page.getByLabel('创作交付日期', { exact: true }).click()
    await expect(page.locator('.n-date-panel:visible')).toHaveCount(1)
    expect(
      await page
        .locator('.editor-modal')
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true)
    await page.screenshot({ path: test.info().outputPath('calendar.png'), animations: 'disabled' })
    await page.getByRole('heading', { name: '留出从容创作的时间' }).click()
    await next(page)
    await expect(page.getByLabel('项目存放位置', { exact: true })).toHaveValue(
      join(directory, 'Documents', 'moondot'),
    )
    await page.locator('.project-location').scrollIntoViewIfNeeded()
    await page.screenshot({ path: test.info().outputPath('location.png') })
    await page.getByRole('button', { name: '确认创建' }).click()
    await expect(page.getByRole('heading', { name: '默认位置项目', exact: true })).toBeVisible()
    const root = join(directory, 'Documents', 'moondot', '默认位置项目')
    expect(await readdir(root)).toEqual(phases.map((phase) => phase.folder))
    await page.locator('.phase-tabs').scrollIntoViewIfNeeded()
    await expect(page.locator('.file-surface')).toHaveAttribute('aria-busy', 'false')
    const height = await page
      .locator('.file-list-viewport')
      .evaluate((element) => element.getBoundingClientRect().height)
    for (const index of [1, 4, 0]) {
      await page.locator('.phase-tabs button').nth(index).click()
      await expect(page.locator('.file-surface')).toHaveAttribute('aria-busy', 'false')
      await expect(page.locator('.file-surface h3')).toHaveText(phases[index]!.name)
      expect(
        await page
          .locator('.file-list-viewport')
          .evaluate((element) => element.getBoundingClientRect().height),
      ).toBe(height)
    }
    const saved = await page.evaluate(async () => {
      const api = (globalThis as unknown as { moondot: MoonDotApi }).moondot
      const response = await api.work.projects({
        query: '',
        status: '',
        trash: false,
        page: 1,
        pageSize: 10,
      })
      if (!response.ok) throw new Error(response.error.message)
      const project = response.data.items[0]!
      return { coverLength: project.cover.length, people: project.stages[0]!.people['制作人'] }
    })
    expect(saved.coverLength).toBeGreaterThan(13_000_000)
    expect(saved.people).toEqual(['林深', '阿海'])
  } finally {
    await app?.close()
    await rm(directory, { recursive: true, force: true })
  }
})
