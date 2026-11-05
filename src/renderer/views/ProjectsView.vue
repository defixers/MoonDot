<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NModal } from 'naive-ui'
import { projectTypes, type Project } from '../../shared/work'
import { displayTime, listQuery, result, useActions, work } from '../work'
import ProjectEditor from '../components/ProjectEditor.vue'
import ProjectCard from '../components/ProjectCard.vue'
const route = useRoute(),
  router = useRouter()
const query = ref(listQuery()),
  items = ref<Project[]>([]),
  total = ref(0),
  editor = ref(false)
const pending = ref<Project>(),
  deleteFiles = ref(false),
  confirmName = ref(''),
  recovery = ref<Project>()
const { error, busy, run } = useActions(load)
let sequence = 0
let recycleTimer: ReturnType<typeof setInterval>
async function load() {
  const ticket = ++sequence
  try {
    const response = await result(
      work().projects({ ...query.value, trash: route.path === '/trash' }),
    )
    if (ticket === sequence) {
      const lastPage = Math.max(1, Math.ceil(response.total / query.value.pageSize))
      if (query.value.page > lastPage) {
        query.value.page = lastPage
        return
      }
      items.value = response.items
      total.value = response.total
    }
  } catch (cause) {
    if (ticket === sequence) error.value = (cause as Error).message
  }
}
watch(
  () => route.path,
  () => {
    query.value = listQuery()
    error.value = ''
    recovery.value = undefined
    pending.value = undefined
    void load()
  },
)
watch(
  query,
  () => {
    void load()
  },
  { deep: true },
)
onMounted(() => {
  void load()
  recycleTimer = setInterval(() => {
    if (route.path === '/trash' && !document.hidden && !busy.value) void load()
  }, 60_000)
})
onUnmounted(() => {
  sequence++
  clearInterval(recycleTimer)
})
function filter() {
  query.value.page = 1
}
async function restore(project: Project, relocate = false) {
  recovery.value = undefined
  await run(async () => {
    let directory: string | undefined
    if (relocate) {
      const chosen = await result(work().chooseDirectory(undefined))
      if (!chosen) return
      directory = chosen
    }
    try {
      await result(work().restoreProject({ id: project.id, directory }))
    } catch (cause) {
      recovery.value = project
      throw cause
    }
  })
}
function purge() {
  if (!pending.value || busy.value) return
  const input = { id: pending.value.id, name: confirmName.value }
  const removeFiles = deleteFiles.value
  void run(async () => {
    await result(removeFiles ? work().deleteProjectFiles(input) : work().purgeProject(input))
    pending.value = undefined
  })
}
function confirmDeletion(project: Project, files: boolean) {
  pending.value = project
  deleteFiles.value = files
  confirmName.value = ''
  error.value = ''
}
</script>
<template>
  <div class="heading-row">
    <div class="page-heading">
      <p class="eyebrow">让每一次创作有处安放</p>
      <h1>{{ route.path === '/trash' ? '项目回收站' : '项目' }}</h1>
      <p v-if="route.path === '/trash'">
        项目记录保留七天，到期仅清理记录。也可手动将本地项目文件移入系统回收站。
      </p>
      <p v-else>从灵感到发行，在自己的节奏里完成。</p>
    </div>
    <button
      v-if="route.path !== '/trash'"
      class="primary"
      @click="editor = true"
    >
      创建项目
    </button>
  </div>
  <form
    class="toolbar"
    @submit.prevent="
      () => {
        filter()
        load()
      }
    "
  >
    <label>
      搜索项目
      <input
        v-model="query.query"
        type="search"
        maxlength="120"
        placeholder="名称、备注或人员"
        @input="filter"
      />
    </label>
    <label>
      项目状态
      <select
        v-model="query.status"
        @change="filter"
      >
        <option value="">全部状态</option>
        <option value="incomplete">未完成</option>
        <option value="completed">已完成</option>
      </select>
    </label>
    <button
      type="button"
      @click="load"
    >
      刷新
    </button>
    <span class="muted">{{ total }} 个项目</span>
  </form>
  <p
    v-if="error"
    class="error-text"
    role="alert"
  >
    {{ error }}
  </p>
  <div
    v-if="recovery"
    class="surface"
  >
    <p>
      恢复“{{ recovery.name }}”需要重新关联可用的项目目录。请选择包含五个阶段文件夹的原项目目录。
    </p>
    <button
      :disabled="busy"
      @click="restore(recovery!, true)"
    >
      重新定位并恢复
    </button>
  </div>
  <div
    v-if="!items.length"
    class="empty-state"
  >
    {{
      route.path === '/trash'
        ? '回收站为空'
        : query.query || query.status
          ? '没有匹配的项目'
          : '还没有项目，创建你的第一个音乐项目。'
    }}
  </div>
  <div
    v-else-if="route.path !== '/trash'"
    class="project-grid"
  >
    <ProjectCard
      v-for="project in items"
      :key="project.id"
      :project="project"
    />
  </div>
  <div
    v-else
    class="trash-list"
  >
    <article
      v-for="project in items"
      :key="project.id"
      class="surface"
    >
      <h2>{{ project.name }}</h2>
      <p class="muted">
        {{ projectTypes[project.type] }} · 删除于 {{ displayTime(project.deletedAt!) }}
      </p>
      <p>
        记录清理时间：{{
          displayTime(new Date(Date.parse(project.deletedAt!) + 7 * 86400000).toISOString())
        }}
      </p>
      <p class="project-directory">{{ project.rootDirectory }}</p>
      <div class="inline-actions">
        <button
          :disabled="busy"
          @click="restore(project)"
        >
          恢复项目
        </button>
        <button
          class="danger"
          :disabled="busy"
          @click="confirmDeletion(project, false)"
        >
          永久删除记录
        </button>
        <button
          class="danger"
          :disabled="busy"
          @click="confirmDeletion(project, true)"
        >
          删除本地项目文件
        </button>
      </div>
    </article>
  </div>
  <div
    v-if="total > query.pageSize"
    class="pagination"
  >
    <button
      :disabled="query.page === 1"
      @click="query.page--"
    >
      上一页
    </button>
    <span>{{ query.page }} / {{ Math.ceil(total / query.pageSize) }}</span>
    <button
      :disabled="query.page * query.pageSize >= total"
      @click="query.page++"
    >
      下一页
    </button>
  </div>
  <ProjectEditor
    v-if="editor"
    @close="editor = false"
    @saved="
      (id) => {
        editor = false
        router.push('/projects/' + id)
      }
    "
  />
  <NModal
    :show="!!pending"
    preset="card"
    :title="deleteFiles ? '删除本地项目文件' : '永久删除项目记录'"
    class="search-modal"
    :mask-closable="false"
    :closable="!busy"
    :close-on-esc="!busy"
    @update:show="!busy && (pending = undefined)"
  >
    <template v-if="deleteFiles">
      <p>
        将以下项目目录及其中所有文件移入系统回收站，同时永久删除软件内的项目记录。文件可从系统回收站找回，软件内记录无法恢复。
      </p>
      <p class="project-directory">{{ pending?.rootDirectory }}</p>
      <p>如果系统回收站不可用，将保留记录并提示失败。</p>
    </template>
    <p v-else>此操作无法恢复，磁盘上的项目文件会保留。</p>
    <p>请输入项目名称“{{ pending?.name }}”确认。</p>
    <label>
      确认项目名称
      <input
        v-model="confirmName"
        :disabled="busy"
        maxlength="120"
      />
    </label>
    <p
      v-if="error"
      class="error-text"
      role="alert"
    >
      {{ error }}
    </p>
    <div class="form-actions">
      <button
        :disabled="busy"
        @click="pending = undefined"
      >
        取消
      </button>
      <button
        class="danger"
        :disabled="busy || confirmName !== pending?.name"
        @click="purge"
      >
        {{ busy ? '正在处理…' : deleteFiles ? '确认移入系统回收站并删除记录' : '确认永久删除记录' }}
      </button>
    </div>
  </NModal>
</template>
<style scoped>
.project-directory {
  overflow-wrap: anywhere;
  color: var(--text-secondary);
  font-size: 13px;
}
</style>
