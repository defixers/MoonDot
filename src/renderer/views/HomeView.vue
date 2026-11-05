<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { NCard, NTag } from 'naive-ui'
import { useWorkspaceStore } from '../stores/workspace'
import type { Project } from '../../shared/work'
import { listQuery, result, work } from '../work'
import ProjectCard from '../components/ProjectCard.vue'
const workspace = useWorkspaceStore()
const projects = ref<Project[]>([]),
  error = ref('')
onMounted(async () => {
  try {
    projects.value = (await result(work().projects({ ...listQuery(), pageSize: 6 }))).items
  } catch (cause) {
    error.value = (cause as Error).message
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
    <p>从第一颗灵感，到作品与世界见面。</p>
  </div>
  <p
    v-if="error"
    class="error-text"
    role="alert"
  >
    {{ error }}
  </p>
  <section v-if="projects.length">
    <div class="heading-row">
      <h2>最近项目</h2>
      <RouterLink to="/projects">全部项目 →</RouterLink>
    </div>
    <div class="project-grid">
      <ProjectCard
        v-for="project in projects"
        :key="project.id"
        :project="project"
      />
    </div>
  </section>
  <NCard
    v-else
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
    <p class="muted">创建项目，安排人员与交付日期，把文件放进每个制作阶段。</p>
    <RouterLink
      class="primary-link"
      to="/projects"
    >
      创建第一个项目
      <span aria-hidden="true">→</span>
    </RouterLink>
  </NCard>
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
      <p>项目信息保存在当前电脑，重启后保留。</p>
    </NCard>
    <NCard
      size="small"
      title="核心备份"
    >
      <NTag type="warning">尚未配置</NTag>
      <p>项目文件存放位置由你选择。核心备份将在后续阶段提供。</p>
    </NCard>
  </section>
</template>
