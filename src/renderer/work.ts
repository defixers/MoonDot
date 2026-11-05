import { ref, onUnmounted } from 'vue'
import type { IpcResult } from '../shared/system'
import type { Mutation, Project } from '../shared/work'

export async function result<T>(request: Promise<IpcResult<T>>): Promise<T> {
  const response = await request
  if (!response.ok) throw new Error(response.error.message)
  return response.data
}
export const work = () => window.moondot.work
export async function allProjects(): Promise<Project[]> {
  const projects: Project[] = []
  for (let page = 1; ; page++) {
    const data = await result(
      work().projects({
        query: '',
        status: '',
        tag: '',
        stage: '',
        dueBefore: '',
        trash: false,
        sort: 'updated',
        page,
        pageSize: 100,
      }),
    )
    projects.push(...data.items)
    if (projects.length >= data.total || !data.items.length) return projects
  }
}
export function useActions(refresh: () => void | Promise<void>) {
  const error = ref(''),
    busy = ref(false),
    undoToken = ref('')
  let timer: ReturnType<typeof setTimeout> | undefined
  onUnmounted(() => clearTimeout(timer))
  async function run(action: () => Promise<unknown>) {
    if (busy.value) return
    busy.value = true
    error.value = ''
    try {
      const outcome = (await action()) as Mutation | undefined
      clearTimeout(timer)
      undoToken.value = outcome?.undoToken ?? ''
      if (undoToken.value)
        timer = setTimeout(() => {
          undoToken.value = ''
        }, 5000)
      await refresh()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '操作失败，请重试'
    } finally {
      busy.value = false
    }
  }
  const reverse = () => run(() => result(work().undo({ token: undoToken.value })))
  return { error, busy, undoToken, run, reverse }
}
export const projectDefaults = {
  name: '',
  artist: '',
  type: 'single' as const,
  genre: '',
  bpm: null,
  musicalKey: '',
  dueDate: '',
  participants: '',
  description: '',
  tags: [] as string[],
  color: '#2563eb',
  cover: '',
  status: 'planning' as const,
  initialTasks: true,
}
