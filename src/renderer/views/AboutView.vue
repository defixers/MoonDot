<script setup lang="ts">
import { NCard } from 'naive-ui'
import license from '../../../LICENSE?raw'
import notices from '../../../THIRD_PARTY_NOTICES.md?raw'
import fontLicense from '../../../resources/licenses/Inter-OFL.txt?raw'
import { useWorkspaceStore } from '../stores/workspace'
const workspace = useWorkspaceStore()
</script>

<template>
  <div class="page-heading">
    <p class="eyebrow">MOONDOT · MUSIC OPS</p>
    <h1>关于月句</h1>
    <p>面向独立音乐人与录音棚的本地音乐工程项目管理工具。</p>
  </div>
  <NCard title="月句 MoonDot">
    <p>版本 {{ workspace.version || '读取中…' }} · 基础预览版</p>
    <p>© 2026 归尘回梦 · MIT License</p>
    <p class="muted">无账号、无云端、无遥测。业务数据保存在本机。</p>
  </NCard>
  <NCard
    title="MIT License"
    class="notice"
  >
    <pre
      class="license-text"
      data-testid="project-license"
      >{{ license }}</pre>
  </NCard>
  <NCard
    title="第三方组件与许可"
    class="notice"
  >
    <pre class="license-text">{{ notices }}</pre>
  </NCard>
  <NCard
    title="Inter 字体许可 · SIL Open Font License 1.1"
    class="notice"
  >
    <pre class="license-text">{{ fontLicense }}</pre>
  </NCard>
</template>
