import { ref } from 'vue'
import type { IpcResult } from '../shared/system'
import { emptyStages, type ProjectDraft } from '../shared/work'

export async function result<T>(request: Promise<IpcResult<T>>): Promise<T> {
  const response = await request
  if (!response.ok) throw new Error(response.error.message)
  return response.data
}
export const work = () => window.moondot.work
export function useActions(refresh: () => void | Promise<void> = () => {}) {
  const error = ref(''),
    busy = ref(false)
  async function run(action: () => Promise<unknown>) {
    if (busy.value) return
    busy.value = true
    error.value = ''
    try {
      await action()
      await refresh()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '操作失败，请重试'
    } finally {
      busy.value = false
    }
  }
  return { error, busy, run }
}
export const projectDefaults = (): ProjectDraft => ({
  name: '',
  type: 'single',
  description: '',
  cover: '',
  dueDate: '',
  stages: emptyStages(),
})
export const displayTime = (value: string) =>
  new Date(value).toLocaleString('zh-CN', { hour12: false })
export const listQuery = () => ({
  query: '',
  status: '' as '' | 'incomplete' | 'completed',
  trash: false,
  page: 1,
  pageSize: 12,
})
