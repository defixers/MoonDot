<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NModal } from 'naive-ui'
import { phases, projectStatuses, projectTypes, type Project } from '../../shared/work'
import { displayTime, result, useActions, work } from '../work'
import ProjectEditor from '../components/ProjectEditor.vue'
import FileBrowser from '../components/FileBrowser.vue'
const route = useRoute(),
  router = useRouter()
const project = ref<Project>(),
  editor = ref(false),
  deleting = ref(false)
const { error, busy, run } = useActions()
let sequence = 0
async function load() {
  const ticket = ++sequence
  try {
    const item = await result(work().project({ id: String(route.params.id) }))
    if (ticket === sequence) project.value = item
  } catch (cause) {
    if (ticket === sequence) {
      project.value = undefined
      error.value = (cause as Error).message
    }
  }
}
onMounted(load)
watch(() => route.params.id, load)
async function relocate() {
  await run(async () => {
    const directory = await result(work().chooseDirectory(undefined))
    if (!directory) return
    await result(work().relocateProject({ id: project.value!.id, directory }))
    await load()
  })
}
async function changeState() {
  await run(async () => {
    await result(
      work().projectState({
        id: project.value!.id,
        status: project.value!.status === 'completed' ? 'incomplete' : 'completed',
      }),
    )
    await load()
  })
}
async function trash() {
  await run(async () => {
    await result(work().trashProject({ id: project.value!.id }))
    deleting.value = false
    await router.push('/projects')
  })
}
</script>
<template>
  <RouterLink
    to="/projects"
    class="muted"
  >
    ← 全部项目
  </RouterLink>
  <p
    v-if="error"
    class="error-text notice"
    role="alert"
  >
    {{ error }}
  </p>
  <template v-if="project">
    <div class="project-hero">
      <div class="project-cover">
        <img
          v-if="project.cover"
          :src="project.cover"
          alt="项目封面"
        />
        <span
          v-else
          aria-hidden="true"
        >
          月
        </span>
      </div>
      <div>
        <p class="eyebrow">
          {{ projectTypes[project.type] }} · {{ projectStatuses[project.status] }}
        </p>
        <h1>{{ project.name }}</h1>
        <p class="muted">
          创建于 {{ displayTime(project.createdAt) }} · 截止日期 {{ project.dueDate || '未设置' }}
        </p>
      </div>
    </div>
    <div class="toolbar">
      <button
        class="primary"
        :disabled="busy"
        @click="editor = true"
      >
        编辑项目
      </button>
      <button
        :disabled="busy"
        @click="changeState"
      >
        {{ project.status === 'completed' ? '重新打开项目' : '标记为已完成' }}
      </button>
      <button
        class="danger"
        :disabled="busy"
        @click="deleting = true"
      >
        删除项目
      </button>
    </div>
    <section class="surface">
      <h2>项目备注</h2>
      <p class="preserve-text">{{ project.description || '暂无备注，可在编辑项目中添加。' }}</p>
      <details>
        <summary>岗位人员</summary>
        <div class="people-overview">
          <div
            v-for="(phase, index) in phases"
            :key="phase.key"
          >
            <h3>{{ phase.name }}</h3>
            <p
              v-for="role in phase.roles"
              :key="role"
            >
              {{ role }}：{{ project.stages[index]!.people[role]?.join('、') || '待添加' }}
            </p>
          </div>
        </div>
      </details>
    </section>
    <section class="directory-bar">
      <div>
        <strong>项目文件目录</strong>
        <p class="file-path">{{ project.rootDirectory }}</p>
      </div>
      <button
        :disabled="busy"
        @click="relocate"
      >
        重新定位
      </button>
      <small class="muted">重新定位仅关联包含五个阶段文件夹的已有项目目录，不搬迁文件。</small>
    </section>
    <FileBrowser
      :key="project.id"
      :project="project"
    />
    <ProjectEditor
      v-if="editor"
      :project="project"
      @close="editor = false"
      @saved="
        () => {
          editor = false
          load()
        }
      "
    />
    <NModal
      v-model:show="deleting"
      preset="card"
      title="将项目移入回收站"
      class="search-modal"
      :mask-closable="false"
    >
      <p>“{{ project.name }}”的记录将在回收站保留七天，磁盘文件保持原样。七天内可恢复项目。</p>
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
          @click="deleting = false"
        >
          取消
        </button>
        <button
          class="danger"
          :disabled="busy"
          @click="trash"
        >
          确认删除项目
        </button>
      </div>
    </NModal>
  </template>
</template>
