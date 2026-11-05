<script setup lang="ts">
import { NCard, NTag } from 'naive-ui'
import { useWorkspaceStore } from '../stores/workspace'
import { onMounted, ref } from 'vue'
import type { Project, Task } from '../../shared/work'
import { result, work } from '../work'
const workspace = useWorkspaceStore()
const projects = ref<Project[]>([]),
  tasks = ref<Task[]>([]),
  error = ref('')
onMounted(async () => {
  try {
    projects.value = (
      await result(
        work().projects({
          query: '',
          status: '',
          tag: '',
          stage: '',
          dueBefore: '',
          trash: false,
          sort: 'updated',
          page: 1,
          pageSize: 6,
        }),
      )
    ).items
    tasks.value = (
      await result(
        work().tasks({
          projectId: null,
          status: '',
          priority: '',
          stageId: null,
          dueBefore: '',
          query: '',
          trash: false,
        }),
      )
    )
      .filter((t) => !['done', 'canceled'].includes(t.status) && t.projectStatus !== 'archived')
      .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))
      .slice(0, 5)
  } catch (e) {
    error.value = String(e)
  }
})
</script>

<template>
  <div class="page-heading">
    <p class="eyebrow">你的本地音乐工作空间</p>
    <h1>
      {{
        workspace.profile.displayName ? `你好，${workspace.profile.displayName}` : '欢迎来到月句'
      }}
    </h1>
    <p>把项目进度、音频版本与交付记录，留在自己的电脑上。</p>
  </div>
  <NCard
    v-if="!projects.length"
    class="welcome-card"
    title="从这里开始"
  >
    <div
      class="welcome-symbol"
      aria-hidden="true"
    >
      月
    </div>
    <h2>准备好下一次创作</h2>
    <p class="muted">创建项目、安排制作阶段，再把下一步拆成任务。音频管理将在后续阶段开放。</p>
    <RouterLink
      class="primary-link"
      to="/projects"
    >
      创建第一个项目
      <span aria-hidden="true">→</span>
    </RouterLink>
  </NCard>
  <p
    v-if="error"
    role="alert"
    class="error-text"
  >
    {{ error }}
  </p>
  <section
    v-if="projects.length"
    class="surface"
  >
    <div class="heading-row">
      <h2>项目脉搏</h2>
      <RouterLink to="/projects">全部项目 →</RouterLink>
    </div>
    <div
      v-for="project in projects"
      :key="project.id"
      class="pulse-row"
    >
      <RouterLink :to="`/projects/${project.id}/overview`">
        <strong>{{ project.name }}</strong>
        <small>{{ project.artist || project.code }} · {{ project.currentStage }}</small>
      </RouterLink>
      <progress
        :value="project.progress"
        max="100"
      />
      <span>{{ project.progress }}%</span>
      <span :class="{ 'risk-tag': project.health !== 'normal' }">
        {{
          project.health === 'overdue'
            ? '已逾期'
            : project.health === 'risk'
              ? '有风险'
              : project.dueDate || '未设截止日'
        }}
      </span>
    </div>
  </section>
  <section
    v-if="tasks.length"
    class="surface"
  >
    <h2>下一步要做</h2>
    <RouterLink
      v-for="task in tasks"
      :key="task.id"
      class="upcoming-task"
      :to="{ path: `/projects/${task.projectId}/tasks`, query: { task: task.id } }"
    >
      <strong>{{ task.title }}</strong>
      <span>{{ task.projectName }} · {{ task.dueDate || '未设截止日' }}</span>
    </RouterLink>
  </section>
  <section
    class="status-grid"
    aria-label="本地工作空间状态"
  >
    <NCard
      size="small"
      title="本地数据"
    >
      <NTag
        :type="workspace.connected ? 'success' : 'warning'"
        data-testid="database-status"
      >
        {{ workspace.connected ? '本地数据库已连接' : '正在连接本地数据库…' }}
      </NTag>
      <p>设置保存在当前电脑，重启后保留。</p>
    </NCard>
    <NCard
      size="small"
      title="素材与备份"
    >
      <NTag type="warning">尚未配置</NTag>
      <p>素材库和核心备份位置将在后续设置中由你选择。</p>
    </NCard>
  </section>
</template>
