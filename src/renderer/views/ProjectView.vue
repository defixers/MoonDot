<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { projectStatuses, type ProjectDetail, type ProjectDraft } from '../../shared/work'
import { result, work, useActions } from '../work'
import ProjectEditor from '../components/ProjectEditor.vue'
import TaskBoard from '../components/TaskBoard.vue'
import NotesPanel from '../components/NotesPanel.vue'
const route = useRoute(),
  router = useRouter(),
  detail = ref<ProjectDetail>(),
  editor = ref(false)
const { error, busy, undoToken, run, reverse } = useActions(load)
const readonly = computed(() => detail.value?.project.status === 'archived'),
  tab = computed(() => route.params.tab ?? 'overview')
let sequence = 0
async function load() {
  const ticket = ++sequence
  try {
    const data = await result(work().project({ id: String(route.params.id) }))
    if (ticket === sequence) detail.value = data
  } catch (e) {
    if (ticket === sequence) {
      detail.value = undefined
      error.value = String(e)
    }
  }
}
onMounted(load)
watch(() => route.params.id, load)
async function trash() {
  await run(async () => {
    const saved = await result(work().trashProject({ id: detail.value!.project.id }))
    await router.push('/projects')
    return saved
  })
}
</script>
<template>
  <p
    v-if="error"
    role="alert"
    class="error-text"
  >
    {{ error }}
    <button @click="load">重试</button>
  </p>
  <template v-if="detail">
    <RouterLink
      to="/projects"
      class="muted"
    >
      ← 所有项目
    </RouterLink>
    <div class="project-hero">
      <div
        class="project-cover"
        :style="{ backgroundColor: detail.project.color }"
      >
        <img
          v-if="detail.project.cover"
          :src="detail.project.cover"
          alt=""
        />
        <span v-else>{{ detail.project.name.slice(0, 1) }}</span>
      </div>
      <div>
        <p class="eyebrow">
          {{ detail.project.code }} · {{ projectStatuses[detail.project.status] }}
        </p>
        <h1>{{ detail.project.name }}</h1>
        <p>
          {{ detail.project.artist || '未填写艺人' }} · 截止
          {{ detail.project.dueDate || '未设置' }}
        </p>
        <div class="tag-row">
          <span
            v-for="tag in detail.project.tags"
            :key="tag"
            class="tag"
          >
            {{ tag }}
          </span>
        </div>
      </div>
      <div class="hero-progress">
        <strong>{{ detail.project.progress }}%</strong>
        <span>
          {{
            detail.project.health === 'normal'
              ? '按计划推进'
              : detail.project.health === 'risk'
                ? '有风险'
                : '已逾期'
          }}
        </span>
      </div>
    </div>
    <div class="toolbar">
      <button
        v-if="!readonly"
        @click="editor = true"
      >
        编辑项目
      </button>
      <button
        :disabled="busy"
        @click="
          run(() =>
            result(
              work().projectState({
                id: detail!.project.id,
                status: readonly ? 'active' : 'archived',
              }),
            ),
          )
        "
      >
        {{ readonly ? '取消归档' : '归档项目' }}
      </button>
      <button
        v-if="!readonly"
        :disabled="busy"
        @click="trash"
      >
        删除项目
      </button>
      <span
        v-if="readonly"
        class="muted"
      >
        归档后只读，取消归档后可继续编辑。
      </span>
    </div>
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
    <nav
      class="tabs"
      aria-label="项目页面"
    >
      <RouterLink
        :to="`/projects/${detail.project.id}/overview`"
        active-class="active"
      >
        概览
      </RouterLink>
      <RouterLink
        :to="`/projects/${detail.project.id}/tasks`"
        active-class="active"
      >
        任务
      </RouterLink>
      <RouterLink
        :to="`/projects/${detail.project.id}/activity`"
        active-class="active"
      >
        动态
      </RouterLink>
    </nav>
    <template v-if="tab === 'overview'">
      <section class="surface">
        <h2>制作阶段</h2>
        <p class="muted">
          有顶层任务时按已完成比例计算；无任务时使用手工状态。取消的任务不计入进度，子任务进度单独显示。
        </p>
        <div class="stages">
          <div
            v-for="stage in detail.stages"
            :key="stage.id"
            class="stage-row"
          >
            <strong>{{ stage.position + 1 }}. {{ stage.name }}</strong>
            <span>权重 {{ Math.round(stage.weight * 10) / 10 }}%</span>
            <progress
              :value="stage.completion"
              max="1"
            />
            <span>{{ Math.round(stage.completion * 100) }}%</span>
            <span
              v-if="
                detail.tasks.some(
                  (t) => t.stageId === stage.id && !t.parentId && t.status !== 'canceled',
                )
              "
              class="muted"
            >
              按任务自动计算
            </span>
            <select
              v-else
              :value="stage.status"
              :aria-label="`阶段状态：${stage.name}`"
              :disabled="readonly || busy"
              @change="
                run(() =>
                  result(
                    work().stageState({
                      id: stage.id,
                      status: ($event.target as HTMLSelectElement).value as
                        'todo' | 'doing' | 'done',
                    }),
                  ),
                )
              "
            >
              <option value="todo">未开始</option>
              <option value="doing">进行中</option>
              <option value="done">已完成</option>
            </select>
          </div>
        </div>
      </section>
      <section class="surface">
        <h2>项目资料</h2>
        <p class="preserve-text">{{ detail.project.description || '暂未填写项目描述' }}</p>
        <dl class="details-grid">
          <dt>参与人</dt>
          <dd>{{ detail.project.participants || '未填写' }}</dd>
          <dt>流派 / BPM / 调性</dt>
          <dd>
            {{ detail.project.genre || '—' }} / {{ detail.project.bpm || '—' }} /
            {{ detail.project.musicalKey || '—' }}
          </dd>
        </dl>
      </section>
      <div class="surface">
        <NotesPanel
          :project-id="detail.project.id"
          :task-id="null"
          :notes="detail.notes"
          :readonly="readonly"
          @changed="load"
        />
      </div>
    </template>
    <TaskBoard
      v-else-if="tab === 'tasks'"
      :key="detail.project.id"
      :project-id="detail.project.id"
      :readonly="readonly"
      :stages="detail.stages"
      @changed="load"
    />
    <section
      v-else
      class="surface"
    >
      <h2>最近动态</h2>
      <p class="muted">保留完整本地记录，此处展示最近 100 条。</p>
      <ol class="activity-list">
        <li
          v-for="item in detail.activity"
          :key="item.id"
        >
          <strong>{{ item.action }}</strong>
          <span>{{ item.actor }} · {{ new Date(item.createdAt).toLocaleString() }}</span>
        </li>
      </ol>
    </section>
    <ProjectEditor
      v-if="editor"
      :project="detail.project as ProjectDraft"
      @close="editor = false"
      @saved="
        () => {
          editor = false
          load()
        }
      "
    />
  </template>
</template>
