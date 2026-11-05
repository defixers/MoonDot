<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { NModal } from 'naive-ui'
import { projectStatuses, type Project } from '../../shared/work'
import { result, work, useActions } from '../work'
import ProjectEditor from '../components/ProjectEditor.vue'
const router = useRouter(),
  projects = ref<Project[]>([]),
  total = ref(0),
  loading = ref(false),
  editor = ref(false),
  view = ref<'cards' | 'table'>('cards')
const filter = ref({
  query: '',
  status: '' as '' | Project['status'],
  tag: '',
  stage: '',
  dueBefore: '',
  trash: false,
  sort: 'updated' as 'updated' | 'due' | 'progress',
  page: 1,
  pageSize: 24,
})
let sequence = 0
const { error, busy, undoToken, run, reverse } = useActions(load)
async function load() {
  const current = ++sequence
  loading.value = true
  try {
    const data = await result(work().projects({ ...filter.value }))
    if (current === sequence) {
      projects.value = data.items
      total.value = data.total
    }
  } catch (e) {
    if (current === sequence) error.value = String(e)
  } finally {
    if (current === sequence) loading.value = false
  }
}
let timer: ReturnType<typeof setTimeout> | undefined
onUnmounted(() => {
  clearTimeout(timer)
  sequence++
})
watch(
  () => JSON.stringify({ ...filter.value, page: 0 }),
  () => {
    filter.value.page = 1
    clearTimeout(timer)
    timer = setTimeout(load, 200)
  },
)
watch(() => filter.value.page, load)
onMounted(async () => {
  await load()
  try {
    view.value = (await result(work().preferences(undefined))).projectView
  } catch (e) {
    error.value = String(e)
  }
})
async function changeView() {
  await run(async () => {
    const prefs = await result(work().preferences(undefined))
    await result(work().savePreferences({ ...prefs, projectView: view.value }))
  })
}
const purge = ref<Project>(),
  confirmName = ref('')
async function removeForever() {
  if (!purge.value) return
  await run(async () => {
    const response = await result(
      work().purgeProject({ id: purge.value!.id, name: confirmName.value }),
    )
    purge.value = undefined
    return response
  })
}
</script>
<template>
  <div class="heading-row">
    <div class="page-heading">
      <p class="eyebrow">从灵感到交付</p>
      <h1>{{ filter.trash ? '项目回收站' : '项目' }}</h1>
      <p>安排制作阶段，让每一步都有清晰进展。</p>
    </div>
    <button
      class="primary"
      @click="editor = true"
    >
      新建项目
    </button>
  </div>
  <div class="toolbar">
    <label>
      搜索项目
      <input
        v-model="filter.query"
        placeholder="项目名、艺人、编号"
      />
    </label>
    <label>
      项目状态
      <select v-model="filter.status">
        <option value="">全部状态</option>
        <option
          v-for="(label, key) in projectStatuses"
          :key="key"
          :value="key"
        >
          {{ label }}
        </option>
      </select>
    </label>
    <label>
      标签
      <input
        v-model="filter.tag"
        placeholder="精确标签"
      />
    </label>
    <label>
      当前阶段
      <input
        v-model="filter.stage"
        placeholder="例如：混音"
      />
    </label>
    <label>
      截止日期之前
      <input
        v-model="filter.dueBefore"
        type="date"
      />
    </label>
    <label>
      项目排序
      <select v-model="filter.sort">
        <option value="updated">最近更新</option>
        <option value="due">截止日</option>
        <option value="progress">进度</option>
      </select>
    </label>
    <label>
      项目视图
      <select
        v-model="view"
        aria-label="项目视图"
        @change="changeView"
      >
        <option value="cards">卡片</option>
        <option value="table">表格</option>
      </select>
    </label>
    <button
      :aria-pressed="filter.trash"
      @click="filter.trash = !filter.trash"
    >
      {{ filter.trash ? '返回项目' : '回收站' }}
    </button>
  </div>
  <p
    v-if="error"
    role="alert"
    class="error-text"
  >
    {{ error }}
    <button @click="load">重试</button>
  </p>
  <div
    v-if="undoToken"
    role="status"
    class="undo-bar"
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
    v-if="filter.trash"
    class="muted"
  >
    软删除数据至少保留 30 天，不自动彻底清除。彻底删除需输入项目名，且无法撤销。
  </p>
  <p
    v-if="loading"
    role="status"
  >
    正在读取项目…
  </p>
  <div
    v-if="!projects.length && !loading"
    class="empty-state"
  >
    <h2>{{ filter.trash ? '回收站为空' : '暂时没有符合条件的项目' }}</h2>
    <p>调整筛选，或创建一个新的音乐项目。</p>
  </div>
  <div
    v-else-if="view === 'table'"
    class="project-table-wrap"
    tabindex="0"
    role="region"
    aria-label="项目表格，可横向滚动"
  >
    <table class="project-table">
      <thead>
        <tr>
          <th scope="col">项目 / 艺人</th>
          <th scope="col">状态</th>
          <th scope="col">当前阶段</th>
          <th scope="col">进度</th>
          <th scope="col">截止日</th>
          <th scope="col">标签</th>
          <th
            v-if="filter.trash"
            scope="col"
          >
            操作
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="project in projects"
          :key="project.id"
          :data-testid="`project-${project.id}`"
        >
          <td>
            <RouterLink
              v-if="!filter.trash"
              :to="`/projects/${project.id}/overview`"
            >
              {{ project.name }}
            </RouterLink>
            <span v-else>{{ project.name }}</span>
            <small class="muted">{{ project.artist || '未填写艺人' }} · {{ project.code }}</small>
          </td>
          <td>{{ projectStatuses[project.status] }}</td>
          <td>{{ project.currentStage }}</td>
          <td>{{ project.progress }}%</td>
          <td>
            {{ project.dueDate || '未设置' }}
            <span
              v-if="project.health !== 'normal'"
              class="risk-tag"
            >
              {{ project.health === 'overdue' ? '已逾期' : '有风险' }}
            </span>
          </td>
          <td>
            <div class="tag-row">
              <span
                v-for="tag in project.tags"
                :key="tag"
                class="tag"
              >
                {{ tag }}
              </span>
            </div>
          </td>
          <td v-if="filter.trash">
            <button
              :disabled="busy"
              @click="run(() => result(work().restoreProject({ id: project.id })))"
            >
              恢复项目
            </button>
            <button
              class="danger"
              @click="
                () => {
                  purge = project
                  confirmName = ''
                }
              "
            >
              彻底删除
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
  <div
    v-else
    class="project-grid"
  >
    <article
      v-for="project in projects"
      :key="project.id"
      class="project-card"
      :data-testid="`project-${project.id}`"
    >
      <div
        class="project-cover"
        :style="{ backgroundColor: project.color }"
      >
        <img
          v-if="project.cover"
          :src="project.cover"
          alt=""
        />
        <span v-else>{{ project.name.slice(0, 1) }}</span>
      </div>
      <div class="project-body">
        <span class="eyebrow">{{ project.code }} · {{ projectStatuses[project.status] }}</span>
        <h2>
          <RouterLink
            v-if="!filter.trash"
            :to="`/projects/${project.id}/overview`"
          >
            {{ project.name }}
          </RouterLink>
          <span v-else>{{ project.name }}</span>
        </h2>
        <p>{{ project.artist || '未填写艺人' }} · {{ project.currentStage }}</p>
        <div class="progress-row">
          <progress
            :value="project.progress"
            max="100"
          />
          <span>{{ project.progress }}%</span>
        </div>
        <p class="muted">
          截止 {{ project.dueDate || '未设置' }}
          <span
            v-if="project.health !== 'normal'"
            class="risk-tag"
          >
            {{ project.health === 'overdue' ? '已逾期' : '有风险' }}
          </span>
        </p>
        <div class="tag-row">
          <span
            v-for="tag in project.tags"
            :key="tag"
            class="tag"
          >
            {{ tag }}
          </span>
        </div>
        <div
          v-if="filter.trash"
          class="form-actions"
        >
          <button
            :disabled="busy"
            @click="run(() => result(work().restoreProject({ id: project.id })))"
          >
            恢复项目
          </button>
          <button
            class="danger"
            @click="
              () => {
                purge = project
                confirmName = ''
              }
            "
          >
            彻底删除
          </button>
        </div>
      </div>
    </article>
  </div>
  <div class="pagination">
    <span>共 {{ total }} 个项目</span>
    <button
      :disabled="filter.page === 1"
      @click="filter.page--"
    >
      上一页
    </button>
    <span>{{ filter.page }}</span>
    <button
      :disabled="filter.page * filter.pageSize >= total"
      @click="filter.page++"
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
        router.push(`/projects/${id}/overview`)
      }
    "
  />
  <NModal
    :show="!!purge"
    preset="card"
    title="彻底删除项目"
    class="editor-modal"
    @close="purge = undefined"
  >
    <p>将永久删除项目、任务、备注与活动。输入「{{ purge?.name }}」确认。</p>
    <label>
      确认项目名
      <input v-model="confirmName" />
    </label>
    <div class="form-actions">
      <button @click="purge = undefined">取消</button>
      <button
        class="danger"
        :disabled="busy || confirmName !== purge?.name"
        @click="removeForever"
      >
        确认彻底删除
      </button>
    </div>
  </NModal>
</template>
