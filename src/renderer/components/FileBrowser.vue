<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { NModal } from 'naive-ui'
import { File, Folder, Upload, RefreshCw, FolderOpen } from '@lucide/vue'
import {
  phases,
  type FileListing,
  type ImportJob,
  type PhaseKey,
  type Project,
} from '../../shared/work'
import { displayTime, result, work } from '../work'
import MotionView from './MotionView.vue'
const props = defineProps<{ project: Project }>()
const phase = ref<PhaseKey>('planning'),
  directory = ref(''),
  listing = ref<FileListing>(),
  error = ref('')
const busy = ref(false),
  viewport = ref<HTMLElement>(),
  job = ref<ImportJob>(),
  loading = ref(false)
const operation = ref<'' | 'create' | 'rename' | 'trash'>(''),
  entryName = ref(''),
  newName = ref(''),
  operationError = ref('')
const importing = computed(() => job.value?.state === 'running')
const locked = computed(() => busy.value || importing.value)
const writable = computed(() => !!listing.value?.writable)
const currentPhase = computed(() => phases.find((item) => item.key === phase.value)!)
const location = () => ({
  projectId: props.project.id,
  stage: phase.value,
  directory: directory.value,
})
watch(
  () => listing.value?.path,
  () => {
    viewport.value?.scrollTo({ top: 0, behavior: 'instant' })
  },
  { flush: 'post' },
)
let refreshTimer: ReturnType<typeof setInterval>,
  jobTimer: ReturnType<typeof setInterval>,
  sequence = 0,
  polling = false
async function refresh() {
  const ticket = ++sequence
  loading.value = true
  try {
    const data = await result(work().files(location()))
    if (ticket === sequence) {
      listing.value = data
      error.value = ''
    }
  } catch (cause) {
    if (ticket === sequence) {
      listing.value = undefined
      error.value = (cause as Error).message
    }
  } finally {
    if (ticket === sequence) loading.value = false
  }
}
watch(
  () => [props.project.id, props.project.rootDirectory, phase.value, directory.value],
  () => {
    void refresh()
  },
)
function changePhase(key: PhaseKey) {
  if (locked.value) return
  phase.value = key
  directory.value = ''
}
function enter(name: string) {
  if (!locked.value && !loading.value)
    directory.value = [directory.value, name].filter(Boolean).join('/')
}
function up() {
  if (!locked.value && !loading.value)
    directory.value = directory.value.split('/').slice(0, -1).join('/')
}
async function perform(action: () => Promise<unknown>) {
  if (busy.value || loading.value) return
  busy.value = true
  error.value = ''
  try {
    await action()
  } catch (cause) {
    error.value = (cause as Error).message
  } finally {
    busy.value = false
  }
}
async function start(sources: string[]) {
  if (!sources.length || locked.value) return
  await perform(async () => {
    job.value = await result(work().startImport({ ...location(), sources }))
  })
}
async function choose(folders: boolean) {
  if (locked.value) return
  await perform(async () => {
    const sources = await result(work().chooseImports({ folders }))
    if (sources.length) job.value = await result(work().startImport({ ...location(), sources }))
  })
}
async function drop(event: DragEvent) {
  if (locked.value || loading.value || !writable.value || !event.dataTransfer) return
  try {
    await start(window.moondot.pathsForFiles([...event.dataTransfer.files]))
  } catch (cause) {
    error.value = (cause as Error).message
  }
}
async function poll() {
  if (!job.value || !importing.value || polling) return
  polling = true
  try {
    job.value = await result(work().importStatus({ id: job.value.id }))
    if (job.value.state !== 'running') await refresh()
  } catch (cause) {
    error.value = (cause as Error).message
  } finally {
    polling = false
  }
}
async function submitOperation() {
  if (locked.value) return
  busy.value = true
  operationError.value = ''
  try {
    const input = { ...location(), name: entryName.value }
    if (operation.value === 'create')
      await result(work().createFolder({ ...input, name: newName.value }))
    if (operation.value === 'rename')
      await result(work().renameFile({ ...input, newName: newName.value }))
    if (operation.value === 'trash') await result(work().trashFile(input))
    operation.value = ''
    await refresh()
  } catch (cause) {
    operationError.value = (cause as Error).message
  } finally {
    busy.value = false
  }
}
function dialog(mode: typeof operation.value, name = '') {
  operation.value = mode
  entryName.value = name
  newName.value = name
  operationError.value = ''
}
function visibleRefresh() {
  if (!document.hidden) void refresh()
}
onMounted(() => {
  void refresh()
  refreshTimer = setInterval(() => {
    if (!document.hidden && !locked.value) void refresh()
  }, 10000)
  jobTimer = setInterval(() => {
    void poll()
  }, 500)
  document.addEventListener('visibilitychange', visibleRefresh)
})
onUnmounted(() => {
  sequence++
  clearInterval(refreshTimer)
  clearInterval(jobTimer)
  document.removeEventListener('visibilitychange', visibleRefresh)
  if (importing.value && job.value) void work().cancelImport({ id: job.value.id })
})
onBeforeRouteLeave(() => {
  if (locked.value) {
    error.value = '文件操作进行中，请先等待完成或取消导入'
    return false
  }
  return true
})
const size = (bytes: number) =>
  bytes < 1024
    ? bytes + ' B'
    : bytes < 1024 ** 2
      ? (bytes / 1024).toFixed(1) + ' KB'
      : (bytes / 1024 ** 2).toFixed(1) + ' MB'
</script>
<template>
  <section class="project-files">
    <h2>制作阶段与文件</h2>
    <div
      class="phase-tabs"
      aria-label="制作阶段"
    >
      <button
        v-for="(item, index) in phases"
        :key="item.key"
        :class="{ selected: phase === item.key }"
        :aria-pressed="phase === item.key"
        :disabled="locked"
        @click="changePhase(item.key)"
      >
        <span class="phase-number">0{{ index + 1 }}</span>
        <strong>{{ item.name }}</strong>
        <small>
          {{
            project.stages[index]!.dueDate
              ? `交付日期：${project.stages[index]!.dueDate}`
              : '未设置交付日期'
          }}
        </small>
      </button>
    </div>
    <div
      class="surface file-surface"
      :aria-busy="loading"
      :inert="loading"
      @dragover.prevent
      @drop.prevent="drop"
    >
      <div class="heading-row">
        <div>
          <h3>{{ currentPhase.name }}</h3>
          <p class="muted file-path">{{ directory || '阶段根目录' }}</p>
        </div>
        <button
          :disabled="!listing"
          @click="perform(() => result(work().openFolder(location())))"
        >
          <FolderOpen :size="16" />
          在资源管理器 / Finder 中打开
        </button>
      </div>
      <div class="file-toolbar">
        <button
          :disabled="locked || !writable"
          @click="choose(false)"
        >
          <Upload :size="16" />
          添加文件
        </button>
        <button
          :disabled="locked || !writable"
          @click="choose(true)"
        >
          导入文件夹
        </button>
        <button
          :disabled="locked || !writable"
          @click="dialog('create')"
        >
          新建子文件夹
        </button>
        <button
          :disabled="locked"
          @click="refresh"
        >
          <RefreshCw :size="16" />
          刷新
        </button>
        <button
          v-if="directory"
          :disabled="locked"
          @click="up"
        >
          返回上级
        </button>
      </div>
      <p class="muted">
        拖入文件或文件夹即可复制导入；遇到同名自动编号，保留两份。当前目录每 10 秒自动刷新。
      </p>
      <p
        v-if="error"
        role="alert"
        class="error-text"
      >
        {{ error }}
      </p>
      <p
        v-if="listing && !writable"
        role="alert"
        class="error-text"
      >
        此目录没有写入权限，请检查磁盘及权限。
      </p>
      <section
        v-if="job"
        class="import-status"
        aria-live="polite"
      >
        <div class="heading-row">
          <strong>
            {{ importing ? '正在导入' : job.state === 'cancelled' ? '导入已取消' : '导入结束' }}
          </strong>
          <button
            v-if="importing"
            @click="perform(() => result(work().cancelImport({ id: job!.id })))"
          >
            取消导入
          </button>
          <button
            v-else
            @click="job = undefined"
          >
            关闭结果
          </button>
        </div>
        <progress
          :value="job.completed + job.failures.length"
          :max="job.total"
          aria-label="文件导入进度"
        />
        <p>
          {{ job.completed }} / {{ job.total }} 项成功 · {{ job.failures.length }} 项失败 · 已复制
          {{ size(job.bytes) }}
        </p>
        <p
          v-if="job.current"
          class="file-path"
        >
          {{ job.current }}
        </p>
        <ul
          v-if="job.failures.length"
          class="error-text"
        >
          <li
            v-for="(failure, index) in job.failures"
            :key="index"
          >
            {{ failure.name }}：{{ failure.message }}
          </li>
        </ul>
      </section>
      <div
        ref="viewport"
        class="file-list-viewport"
      >
        <div
          v-if="loading"
          class="file-loading"
          role="status"
        >
          正在读取目录…
        </div>
        <MotionView
          :active-key="listing?.path ?? ''"
          kind="panel"
        >
          <p
            v-if="listing && !listing.entries.length"
            class="empty-state"
          >
            {{ directory ? '文件夹为空' : '把这一阶段的文件放在这里' }}
          </p>
          <div
            v-if="listing?.entries.length"
            class="file-list"
          >
            <div class="file-list-header">
              <span>名称</span>
              <span>修改时间</span>
              <span>加入项目时间</span>
              <span>操作</span>
            </div>
            <div
              v-for="entry in listing?.entries"
              :key="entry.name"
              class="file-row"
            >
              <div class="file-name">
                <component
                  :is="entry.directory ? Folder : File"
                  :size="22"
                />
                <div>
                  <button
                    v-if="entry.directory"
                    class="text-button"
                    :disabled="locked"
                    @click="enter(entry.name)"
                  >
                    {{ entry.name }}
                  </button>
                  <strong v-else>{{ entry.name }}</strong>
                  <small>{{ entry.directory ? '文件夹' : size(entry.size) }}</small>
                </div>
              </div>
              <span>
                <small class="mobile-label">修改时间</small>
                {{ displayTime(entry.modifiedAt) }}
              </span>
              <span>
                <small class="mobile-label">加入项目</small>
                {{ displayTime(entry.addedAt) }}
              </span>
              <div class="file-actions">
                <button
                  :disabled="locked || !writable"
                  :aria-label="`重命名 ${entry.name}`"
                  @click="dialog('rename', entry.name)"
                >
                  重命名
                </button>
                <button
                  :disabled="locked || !writable"
                  :aria-label="`删除 ${entry.name}`"
                  @click="dialog('trash', entry.name)"
                >
                  删除
                </button>
                <button
                  :aria-label="`在文件夹中显示 ${entry.name}`"
                  @click="
                    perform(() => result(work().revealFile({ ...location(), name: entry.name })))
                  "
                >
                  在文件夹中显示
                </button>
              </div>
            </div>
          </div>
        </MotionView>
      </div>
    </div>
  </section>
  <NModal
    :show="!!operation"
    preset="card"
    :title="
      operation === 'create' ? '新建子文件夹' : operation === 'rename' ? '重命名' : '移入系统回收站'
    "
    class="search-modal"
    :mask-closable="false"
    :close-on-esc="!busy"
    @update:show="!busy && (operation = '')"
  >
    <form @submit.prevent="submitOperation">
      <p v-if="operation === 'trash'">
        将“{{ entryName }}”移入系统回收站；若系统不支持，文件会保留并提示你。
      </p>
      <label v-else>
        名称
        <input
          v-model="newName"
          required
          maxlength="255"
          :disabled="busy"
        />
      </label>
      <p
        v-if="operationError"
        class="error-text"
        role="alert"
      >
        {{ operationError }}
      </p>
      <div class="form-actions">
        <button
          type="button"
          :disabled="busy"
          @click="operation = ''"
        >
          取消
        </button>
        <button
          class="primary"
          :disabled="busy"
        >
          {{ operation === 'trash' ? '确认移入系统回收站' : '保存' }}
        </button>
      </div>
    </form>
  </NModal>
</template>
