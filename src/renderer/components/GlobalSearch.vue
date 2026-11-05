<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { NModal } from 'naive-ui'
import type { SearchHit } from '../../shared/work'
import { result, work } from '../work'
const router = useRouter(),
  show = ref(false),
  query = ref(''),
  archived = ref(false),
  hits = ref<SearchHit[]>([]),
  busy = ref(false),
  error = ref(''),
  input = ref<HTMLInputElement>()
let timer: ReturnType<typeof setTimeout> | undefined,
  sequence = 0
function shortcut(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    show.value = true
  }
}
onMounted(() => window.addEventListener('keydown', shortcut))
onUnmounted(() => {
  window.removeEventListener('keydown', shortcut)
  clearTimeout(timer)
  sequence++
})
watch([query, archived, show], () => {
  const ticket = ++sequence
  clearTimeout(timer)
  hits.value = []
  error.value = ''
  busy.value = false
  if (!show.value || !query.value.trim()) return
  busy.value = true
  timer = setTimeout(async () => {
    try {
      const items = await result(
        work().search({ query: query.value.trim(), includeArchived: archived.value }),
      )
      if (ticket === sequence) hits.value = items
    } catch (e) {
      if (ticket === sequence) error.value = String(e)
    } finally {
      if (ticket === sequence) busy.value = false
    }
  }, 200)
})
function open(hit: SearchHit) {
  show.value = false
  void router.push(
    hit.taskId
      ? { path: `/projects/${hit.projectId}/tasks`, query: { task: hit.taskId } }
      : `/projects/${hit.projectId}/overview`,
  )
}
</script>
<template>
  <button
    class="search-trigger"
    @click="show = true"
  >
    搜索项目、任务与备注
    <kbd>Ctrl / ⌘ K</kbd>
  </button>
  <NModal
    v-model:show="show"
    preset="card"
    title="全局搜索"
    class="search-modal"
    @after-enter="input?.focus()"
  >
    <label>
      搜索关键词
      <input
        ref="input"
        v-model="query"
        type="search"
        maxlength="120"
        placeholder="输入中文或英文关键词"
      />
    </label>
    <label class="check-label">
      <input
        v-model="archived"
        type="checkbox"
      />
      包括已归档项目
    </label>
    <p
      v-if="busy"
      role="status"
    >
      正在搜索…
    </p>
    <p
      v-if="error"
      role="alert"
      class="error-text"
    >
      {{ error }}
    </p>
    <p
      v-if="!busy && !hits.length"
      class="muted"
    >
      {{ query.trim() ? '没有找到匹配内容' : '搜索项目、任务标题、正文与备注。支持中文短词。' }}
    </p>
    <div class="search-results">
      <button
        v-for="hit in hits"
        :key="`${hit.kind}-${hit.id}`"
        @click="open(hit)"
      >
        <small>
          {{ hit.kind === 'project' ? '项目' : hit.kind === 'task' ? '任务' : '备注' }} ·
          {{ hit.projectName }}
        </small>
        <strong>{{ hit.title }}</strong>
        <span>{{ hit.excerpt }}</span>
      </button>
    </div>
    <p
      v-if="hits.length === 50"
      class="muted"
    >
      仅显示前 50 条，请输入更具体的关键词。
    </p>
  </NModal>
</template>
