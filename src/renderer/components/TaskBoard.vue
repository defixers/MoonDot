<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { taskStatuses, priorities, type Task, type Stage, type Project } from '../../shared/work'
import { result, work, useActions, allProjects } from '../work'
import TaskEditor from './TaskEditor.vue'
const props = defineProps<{ projectId?: string; readonly?: boolean; stages?: Stage[] }>()
const emit = defineEmits<{ changed: [] }>()
const route = useRoute(),
  router = useRouter(),
  tasks = ref<Task[]>([]),
  view = ref<'board' | 'list'>('board'),
  editor = ref(false),
  selected = ref<Task>(),
  parentId = ref<string>(),
  dragging = ref<Task>(),
  loading = ref(false)
const filters = ref({
  status: '' as '' | Task['status'],
  priority: '' as '' | Task['priority'],
  stageId: null as string | null,
  dueBefore: '',
  query: '',
  trash: false,
})
const columns = ['todo', 'doing', 'review', 'done'] as const
const projects = ref<Project[]>([])
const selectedProject = ref<string | null>(null)
const projectStages = ref<Stage[]>([])
const effectiveProject = computed(() => props.projectId ?? selectedProject.value)
const availableStages = computed(() => props.stages ?? projectStages.value)
const { error, busy, undoToken, run, reverse } = useActions(async () => {
  await load()
  emit('changed')
})
const board = computed(
  () => view.value === 'board' && !filters.value.trash && filters.value.status !== 'canceled',
)
let seq = 0,
  timer: ReturnType<typeof setTimeout> | undefined
onUnmounted(() => {
  clearTimeout(timer)
  seq++
})
async function load() {
  const ticket = ++seq
  loading.value = true
  try {
    const items = await result(
      work().tasks({ ...filters.value, projectId: effectiveProject.value }),
    )
    if (ticket === seq) {
      tasks.value = items
      if (typeof route.query.task === 'string') {
        const task = items.find((t) => t.id === route.query.task)
        if (task) {
          selected.value = task
          editor.value = true
        }
      }
    }
  } catch (e) {
    if (ticket === seq) error.value = String(e)
  } finally {
    if (ticket === seq) loading.value = false
  }
}
onMounted(async () => {
  try {
    view.value = (await result(work().preferences(undefined))).taskView
    if (!props.projectId) projects.value = await allProjects()
  } catch (e) {
    error.value = String(e)
  }
  await load()
})
watch(
  () => JSON.stringify([filters.value, effectiveProject.value, route.query.task]),
  () => {
    clearTimeout(timer)
    timer = setTimeout(load, 200)
  },
)
watch(selectedProject, async (id) => {
  filters.value.stageId = null
  projectStages.value = []
  if (!id) return
  try {
    const detail = await result(work().project({ id }))
    if (selectedProject.value === id) projectStages.value = detail.stages
  } catch (e) {
    error.value = String(e)
  }
})
async function changeView() {
  await run(async () => {
    const preferences = await result(work().preferences(undefined))
    await result(work().savePreferences({ ...preferences, taskView: view.value }))
  })
}
function open(task?: Task, parent?: string) {
  selected.value = task
  parentId.value = parent
  editor.value = true
}
async function close() {
  editor.value = false
  selected.value = undefined
  if (route.query.task) await router.replace({ query: { ...route.query, task: undefined } })
  await load()
}
async function saved() {
  await close()
  emit('changed')
}
async function move(task: Task, status: Task['status'], beforeId: string | null = null) {
  if (busy.value || props.readonly || task.projectStatus === 'archived') return
  const old = [...tasks.value]
  tasks.value = tasks.value.map((item) => (item.id === task.id ? { ...item, status } : item))
  await run(async () => {
    try {
      return await result(work().moveTask({ id: task.id, status, beforeId }))
    } catch (e) {
      tasks.value = old
      throw e
    }
  })
}
async function drop(status: Task['status'], before?: Task) {
  const task = dragging.value
  dragging.value = undefined
  if (task && task.id !== before?.id)
    await move(task, status, before?.projectId === task.projectId ? before.id : null)
}
function earlier(task: Task) {
  const list = tasks.value.filter((t) => t.status === task.status && t.projectId === task.projectId)
  const index = list.findIndex((t) => t.id === task.id)
  if (index > 0) void move(task, task.status, list[index - 1]!.id)
}
</script>
<template>
  <div class="heading-row">
    <h2>{{ projectId ? '项目任务' : '我的任务' }}</h2>
    <button
      v-if="!readonly"
      class="primary"
      @click="open()"
    >
      新建任务
    </button>
  </div>
  <div class="toolbar">
    <label v-if="!projectId">
      筛选项目
      <select
        v-model="selectedProject"
        aria-label="筛选项目"
      >
        <option :value="null">全部项目</option>
        <option
          v-for="project in projects"
          :key="project.id"
          :value="project.id"
        >
          {{ project.name }}
        </option>
      </select>
    </label>
    <label>
      搜索任务
      <input
        v-model="filters.query"
        placeholder="任务名或负责人"
      />
    </label>
    <label>
      筛选任务状态
      <select v-model="filters.status">
        <option value="">全部状态</option>
        <option
          v-for="(label, key) in taskStatuses"
          :key="key"
          :value="key"
        >
          {{ label }}
        </option>
      </select>
    </label>
    <label>
      筛选优先级
      <select v-model="filters.priority">
        <option value="">全部优先级</option>
        <option
          v-for="(label, key) in priorities"
          :key="key"
          :value="key"
        >
          {{ label }}
        </option>
      </select>
    </label>
    <label v-if="availableStages.length">
      筛选阶段
      <select v-model="filters.stageId">
        <option :value="null">全部阶段</option>
        <option
          v-for="stage in availableStages"
          :key="stage.id"
          :value="stage.id"
        >
          {{ stage.name }}
        </option>
      </select>
    </label>
    <label>
      任务截止日期之前
      <input
        v-model="filters.dueBefore"
        type="date"
      />
    </label>
    <label>
      任务视图
      <select
        v-model="view"
        @change="changeView"
      >
        <option value="board">看板</option>
        <option value="list">列表</option>
      </select>
    </label>
    <button
      :aria-pressed="filters.trash"
      @click="filters.trash = !filters.trash"
    >
      {{ filters.trash ? '返回任务' : '已删除任务' }}
    </button>
  </div>
  <p
    v-if="error"
    class="error-text"
    role="alert"
  >
    {{ error }}
    <button @click="load">重试</button>
  </p>
  <div
    v-if="undoToken"
    class="undo-bar"
    role="status"
  >
    操作已保存
    <button
      :disabled="busy"
      @click="reverse"
    >
      撤销（5 秒）
    </button>
  </div>
  <p
    v-if="loading"
    role="status"
  >
    正在读取任务…
  </p>
  <p
    v-if="board"
    class="muted"
  >
    拖动卡片可移动状态和顺序，也可使用卡片内的状态选择与“上移”。已取消任务可在列表或状态筛选中查看。
  </p>
  <div :class="board ? 'kanban' : 'task-list'">
    <section
      v-for="column in board ? columns : ['all']"
      :key="column"
      class="kanban-column"
      @dragover.prevent
      @drop.prevent="column !== 'all' && drop(column as Task['status'])"
    >
      <h3 v-if="board">
        {{ taskStatuses[column as Task['status']] }}
        <span class="muted">{{ tasks.filter((t) => t.status === column).length }}</span>
      </h3>
      <article
        v-for="task in tasks.filter((t) => !board || t.status === column)"
        :key="task.id"
        class="task-card"
        :data-testid="`task-${task.id}`"
        :draggable="!readonly && !busy && !filters.trash && task.projectStatus !== 'archived'"
        tabindex="0"
        @dragstart="dragging = task"
        @dragend="dragging = undefined"
        @dragover.prevent
        @drop.stop.prevent="drop(task.status, task)"
        @keydown.ctrl.enter="open(task)"
        @keydown.meta.enter="open(task)"
      >
        <small class="muted">
          <i
            class="color-dot"
            :style="{ background: task.projectColor }"
          />
          {{ task.projectName }}{{ task.parentId ? ' · 子任务' : '' }}
        </small>
        <button
          class="task-title"
          :disabled="filters.trash"
          @click="open(task)"
        >
          {{ task.title }}
        </button>
        <p class="task-meta">
          {{ priorities[task.priority] }}优先级 · {{ task.dueDate || '无截止日' }}
          <br v-if="task.assignee" />
          {{ task.assignee }}
        </p>
        <p class="task-meta">
          {{ task.childDone }}/{{ task.childCount }} 子任务 · {{ task.noteCount }} 条备注
        </p>
        <div
          v-if="!readonly && task.projectStatus !== 'archived'"
          class="task-controls"
        >
          <template v-if="filters.trash">
            <button
              :disabled="busy"
              @click="run(() => result(work().restoreTask({ id: task.id })))"
            >
              恢复任务
            </button>
          </template>
          <template v-else>
            <select
              :value="task.status"
              :aria-label="`状态：${task.title}`"
              :disabled="busy"
              @change="move(task, ($event.target as HTMLSelectElement).value as Task['status'])"
            >
              <option
                v-for="(label, key) in taskStatuses"
                :key="key"
                :value="key"
              >
                {{ label }}
              </option>
            </select>
            <button
              :disabled="busy"
              @click="earlier(task)"
            >
              上移
            </button>
            <button
              v-if="!task.parentId"
              @click="open(undefined, task.id)"
            >
              子任务
            </button>
            <button
              :disabled="busy"
              @click="run(() => result(work().trashTask({ id: task.id })))"
            >
              删除
            </button>
          </template>
        </div>
      </article>
      <p
        v-if="!tasks.some((t) => !board || t.status === column)"
        class="column-empty"
      >
        {{ board ? '拖动任务到这里' : '暂无符合条件的任务' }}
      </p>
    </section>
  </div>
  <TaskEditor
    v-if="editor"
    :task="selected"
    :project-id="
      selected?.projectId ??
      effectiveProject ??
      (parentId ? tasks.find((t) => t.id === parentId)?.projectId : undefined)
    "
    :parent-id="parentId"
    @close="close"
    @saved="saved"
  />
</template>
