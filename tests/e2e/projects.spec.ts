import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'

test('项目、阶段、任务、备注与搜索形成闭环，重启保留数据', async () => {
  test.setTimeout(90000)
  const directory = await mkdtemp(join(tmpdir(), 'moondot-project-e2e-'))
  const env = Object.fromEntries(
    Object.entries(process.env).filter((item): item is [string, string] => item[1] !== undefined),
  )
  env.MOONDOT_USER_DATA = directory
  delete env.ELECTRON_RUN_AS_NODE
  let app: ElectronApplication | undefined
  try {
    app = await electron.launch({ args: [resolve('.')], env })
    let page = await app.firstWindow()
    await expect(page.getByTestId('database-status')).toHaveText('本地数据库已连接')
    await page.getByRole('link', { name: '项目', exact: true }).click()
    await page.getByRole('button', { name: '新建项目', exact: true }).click()
    await page.getByLabel('项目名称', { exact: true }).fill('夏日回声计划')
    await page.getByLabel('艺人', { exact: true }).fill('林深')
    await page.getByLabel('标签（逗号分隔）').fill('独立,夏日')
    await page.getByRole('button', { name: '下一步', exact: true }).click()
    await page.getByLabel('生成初始任务', { exact: false }).uncheck()
    await page.getByRole('button', { name: '保存项目', exact: true }).click()
    await expect(page.getByRole('heading', { name: '夏日回声计划', exact: true })).toBeVisible()
    const projectUrl = page.url()
    await page.getByRole('button', { name: '编辑项目', exact: true }).click()
    await page.getByLabel('流派', { exact: true }).fill('梦幻流行')
    await page.getByRole('button', { name: '保存项目', exact: true }).click()
    await expect(page.getByText('梦幻流行 / — / —', { exact: true })).toBeVisible()
    await page.getByLabel('阶段状态：企划', { exact: true }).selectOption('done')
    await expect(page.locator('.hero-progress strong')).toHaveText('5%')
    await page.getByLabel('项目备注内容').fill('回声里的夏天，先确定创作方向')
    await page.getByRole('button', { name: '添加备注', exact: true }).click()
    await expect(page.getByText('回声里的夏天，先确定创作方向', { exact: true })).toBeVisible()
    await page.getByRole('link', { name: '任务', exact: true }).click()
    await page.getByRole('button', { name: '新建任务', exact: true }).click()
    await page.getByLabel('任务标题', { exact: true }).fill('录制夏日主唱')
    await page.getByLabel('关联阶段', { exact: true }).selectOption({ label: '录音' })
    await page.getByRole('button', { name: '保存任务', exact: true }).click()
    await expect(page.getByRole('button', { name: '录制夏日主唱', exact: true })).toBeVisible()
    await page.getByLabel('状态：录制夏日主唱', { exact: true }).selectOption('done')
    await expect(page.locator('.hero-progress strong')).toHaveText('25%')
    await page.getByRole('button', { name: '录制夏日主唱', exact: true }).click()
    await page.getByLabel('任务备注内容').fill('主唱需要温暖的空间感')
    await page.getByRole('button', { name: '添加备注', exact: true }).click()
    await expect(page.getByText('主唱需要温暖的空间感', { exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k')
    await page.getByLabel('搜索关键词', { exact: true }).fill('温暖')
    await page.locator('.search-results button').filter({ hasText: '温暖' }).click()
    await expect(page.getByLabel('任务标题', { exact: true })).toHaveValue('录制夏日主唱')
    await page.keyboard.press('Escape')
    await page.screenshot({ path: test.info().outputPath('project-board.png'), fullPage: true })
    await page.getByRole('link', { name: '我的任务', exact: true }).click()
    await page.getByLabel('筛选项目', { exact: true }).selectOption({ label: '夏日回声计划' })
    await expect(page.getByRole('button', { name: '录制夏日主唱', exact: true })).toBeVisible()
    await page.getByRole('link', { name: '项目', exact: true }).click()
    await page.getByLabel('项目视图', { exact: true }).selectOption('table')
    await expect(page.getByRole('table')).toContainText('夏日回声计划')
    await page.screenshot({ path: test.info().outputPath('project-table.png'), fullPage: true })
    await page.getByLabel('项目视图', { exact: true }).selectOption('cards')
    await app.close()
    app = await electron.launch({ args: [resolve('.')], env })
    page = await app.firstWindow()
    await page.getByRole('link', { name: '夏日回声计划', exact: false }).click()
    await expect(page.locator('.hero-progress strong')).toHaveText('25%')
    await expect(page.getByText('回声里的夏天，先确定创作方向', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '归档项目', exact: true }).click()
    await expect(page.getByRole('button', { name: '编辑项目', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: '撤销（5 秒）', exact: true }).click()
    await expect(page.getByRole('button', { name: '编辑项目', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '删除项目', exact: true }).click()
    await page.getByRole('button', { name: '回收站', exact: true }).click()
    await expect(page.getByRole('heading', { name: '夏日回声计划', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '恢复项目', exact: true }).click()
    await page.getByRole('button', { name: '返回项目', exact: true }).click()
    await page.getByRole('link', { name: '夏日回声计划', exact: true }).click()
    expect(page.url()).toBe(projectUrl)
    await page.screenshot({ path: test.info().outputPath('project-overview.png'), fullPage: true })
  } finally {
    await app?.close()
    await rm(directory, { recursive: true, force: true })
  }
})

test('可编辑模板与默认工作偏好，IPC 拒绝非法字段与归档写入', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moondot-template-e2e-'))
  const env = Object.fromEntries(
    Object.entries(process.env).filter((item): item is [string, string] => item[1] !== undefined),
  )
  env.MOONDOT_USER_DATA = directory
  delete env.ELECTRON_RUN_AS_NODE
  let app: ElectronApplication | undefined
  try {
    app = await electron.launch({ args: [resolve('.')], env })
    const page = await app.firstWindow()
    await page.getByRole('link', { name: '阶段模板', exact: true }).click()
    await page.getByRole('button', { name: '新建模板', exact: true }).click()
    await page.getByLabel('模板名称', { exact: true }).fill('现场录音流程')
    await page.getByRole('button', { name: '保存模板', exact: true }).click()
    await expect(page.getByRole('heading', { name: '现场录音流程', exact: true })).toBeVisible()
    await page.getByRole('link', { name: '设置', exact: true }).click()
    await page.getByLabel('默认阶段模板', { exact: true }).selectOption({ label: '现场录音流程' })
    await page.getByLabel('默认项目视图', { exact: true }).selectOption('table')
    await page.getByRole('button', { name: '保存工作偏好', exact: true }).click()
    await expect(page.getByRole('status')).toHaveText('设置已保存')
    const checks = await page.evaluate(`(async()=>{
    const p=await window.moondot.work.preferences();
    const bad=await window.moondot.work.savePreferences({projectView:'table',taskView:'list',defaultTemplateId:null,path:'/tmp'});
    const created=await window.moondot.work.saveProject({name:'只读验证',artist:'',type:'single',genre:'',bpm:null,musicalKey:'',dueDate:'',participants:'',description:'',tags:[],color:'#2563eb',cover:'',status:'active'});
    await window.moondot.work.projectState({id:created.data.id,status:'archived'});
    const denied=await window.moondot.work.saveNote({projectId:created.data.id,taskId:null,body:'不可写入'});
    return {preferences:p,invalid:bad,archived:denied};
  })()`)
    expect(checks).toMatchObject({
      preferences: { ok: true, data: { projectView: 'table' } },
      invalid: { ok: false, error: { code: 'VALIDATION_FAILED' } },
      archived: { ok: false, error: { code: 'READ_ONLY' } },
    })
  } finally {
    await app?.close()
    await rm(directory, { recursive: true, force: true })
  }
})
