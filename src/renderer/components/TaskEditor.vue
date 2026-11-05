<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { NDrawer, NDrawerContent } from 'naive-ui'
import {
  taskStatuses,
  priorities,
  type Task,
  type TaskDraft,
  type Project,
  type ProjectDetail,
} from '../../shared/work'
import { result, work, allProjects } from '../work'
import NotesPanel from './NotesPanel.vue'
const props = defineProps<{ task?: Task; projectId?: string; parentId?: string }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const draft = ref<TaskDraft>({
  id: props.task?.id,
  projectId: props.task?.projectId ?? props.projectId ?? '',
  stageId: props.task?.stageId ?? null,
  parentId: props.task?.parentId ?? props.parentId ?? null,
  title: props.task?.title ?? '',
  description: props.task?.description ?? '',
  status: props.task?.status ?? 'todo',
  priority: props.task?.priority ?? 'medium',
  dueDate: props.task?.dueDate ?? '',
  assignee: props.task?.assignee ?? '',
})
const projects = ref<Project[]>([]),
  detail = ref<ProjectDetail>(),
  error = ref(''),
  busy = ref(false)
const readonly = computed(() => detail.value?.project.status === 'archived')
async function load() {
  if (!draft.value.projectId) return
  try {
    detail.value = await result(work().project({ id: draft.value.projectId }))
  } catch (e) {
    error.value = String(e)
  }
}
onMounted(async () => {
  try {
    if (!draft.value.projectId) {
      projects.value = (await allProjects()).filter((p) => p.status !== 'archived')
      draft.value.projectId = projects.value[0]?.id ?? ''
    }
    await load()
  } catch (e) {
    error.value = String(e)
  }
})
watch(
  () => draft.value.projectId,
  () => {
    draft.value.stageId = null
    draft.value.parentId = null
    void load()
  },
)
async function save() {
  busy.value = true
  error.value = ''
  try {
    await result(work().saveTask({ ...draft.value }))
    emit('saved')
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败'
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <NDrawer
    :show="true"
    :width="520"
    :auto-focus="true"
    @update:show="emit('close')"
  >
    <NDrawerContent
      :title="task ? '任务详情' : '创建任务'"
      closable
    >
      <p
        v-if="readonly"
        class="muted"
      >
        项目已归档，任务只读。
      </p>
      <form @submit.prevent="save">
        <fieldset
          :disabled="readonly || busy"
          class="form-stack"
        >
          <label v-if="!projectId && !task">
            所属项目
            <select
              v-model="draft.projectId"
              aria-label="所属项目"
              required
            >
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
            任务标题
            <input
              v-model="draft.title"
              required
              maxlength="120"
              autofocus
            />
          </label>
          <label>
            任务描述
            <textarea
              v-model="draft.description"
              maxlength="10000"
              rows="3"
            />
          </label>
          <div class="form-grid">
            <label>
              任务状态
              <select
                v-model="draft.status"
                aria-label="任务状态"
              >
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
              优先级
              <select
                v-model="draft.priority"
                aria-label="优先级"
              >
                <option
                  v-for="(label, key) in priorities"
                  :key="key"
                  :value="key"
                >
                  {{ label }}
                </option>
              </select>
            </label>
            <label>
              关联阶段
              <select
                v-model="draft.stageId"
                aria-label="关联阶段"
              >
                <option :value="null">未分配阶段</option>
                <option
                  v-for="stage in detail?.stages"
                  :key="stage.id"
                  :value="stage.id"
                >
                  {{ stage.name }}
                </option>
              </select>
            </label>
            <label>
              父任务
              <select
                v-model="draft.parentId"
                aria-label="父任务"
              >
                <option :value="null">顶层任务</option>
                <option
                  v-for="parent in detail?.tasks.filter((t) => !t.parentId && t.id !== task?.id)"
                  :key="parent.id"
                  :value="parent.id"
                >
                  {{ parent.title }}
                </option>
              </select>
            </label>
            <label>
              任务截止日
              <input
                v-model="draft.dueDate"
                type="date"
              />
            </label>
            <label>
              负责人
              <input
                v-model="draft.assignee"
                maxlength="120"
                placeholder="自由文本，无账号关联"
              />
            </label>
          </div>
          <button
            class="primary"
            :disabled="!draft.projectId"
          >
            {{ busy ? '保存中…' : '保存任务' }}
          </button>
        </fieldset>
      </form>
      <p
        v-if="error"
        role="alert"
        class="error-text"
      >
        {{ error }}
      </p>
      <section v-if="task && detail?.tasks.some((t) => t.parentId === task?.id)">
        <h2>子任务</h2>
        <ul>
          <li
            v-for="child in detail?.tasks.filter((t) => t.parentId === task?.id)"
            :key="child.id"
          >
            {{ child.title }} · {{ taskStatuses[child.status] }}
          </li>
        </ul>
      </section>
      <NotesPanel
        v-if="task && detail"
        :project-id="draft.projectId"
        :task-id="task.id"
        :notes="detail.notes"
        :readonly="readonly"
        @changed="load"
      />
    </NDrawerContent>
  </NDrawer>
</template>
