<script setup lang="ts">
import { NCard, NTag } from 'naive-ui'
import { useWorkspaceStore } from '../stores/workspace'
const workspace = useWorkspaceStore()
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
    <p class="muted">
      当前为基础预览版。你可以设置本机显示名；项目、任务和音频管理将在后续阶段开放。
    </p>
    <RouterLink
      class="primary-link"
      to="/settings"
    >
      设置本机显示名
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
