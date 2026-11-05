<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { LayoutDashboard, Settings, Info, Folder, CheckSquare, Layers } from '@lucide/vue'
import { useRoute } from 'vue-router'
import { NAlert, NButton, NConfigProvider, zhCN, dateZhCN } from 'naive-ui'
import { useWorkspaceStore } from './stores/workspace'
import GlobalSearch from './components/GlobalSearch.vue'
const workspace = useWorkspaceStore()
const route = useRoute()
const content = ref<HTMLElement>()
onMounted(workspace.load)
</script>

<template>
  <NConfigProvider
    :locale="zhCN"
    :date-locale="dateZhCN"
    :theme-overrides="{
      common: {
        primaryColor: '#2563EB',
        primaryColorHover: '#1D4ED8',
        primaryColorPressed: '#1E40AF',
        successColor: '#12805C',
        warningColor: '#B45309',
        errorColor: '#B42318',
        borderRadius: '8px',
        fontFamily: 'inherit',
      },
    }"
  >
    <a
      class="skip-link"
      href="#main-content"
      @click.prevent="content?.focus()"
    >
      跳转到主要内容
    </a>
    <div class="shell">
      <aside class="sidebar">
        <RouterLink
          to="/"
          class="brand-link"
          aria-label="月句 MoonDot 工作台"
        >
          <span class="brand-mark">月</span>
          <span class="brand-name">
            月句
            <small>MOONDOT · MUSIC OPS</small>
          </span>
        </RouterLink>
        <nav aria-label="主要导航">
          <RouterLink
            to="/"
            class="nav-link"
            exact-active-class="selected"
            aria-label="工作台"
          >
            <LayoutDashboard
              :size="18"
              aria-hidden="true"
            />
            <span class="nav-label">工作台</span>
          </RouterLink>
          <RouterLink
            v-for="item in [
              { path: '/projects', label: '项目', icon: Folder },
              { path: '/tasks', label: '我的任务', icon: CheckSquare },
              { path: '/templates', label: '阶段模板', icon: Layers },
            ]"
            :key="item.path"
            :to="item.path"
            class="nav-link"
            active-class="selected"
            :aria-label="item.label"
          >
            <component
              :is="item.icon"
              :size="18"
              aria-hidden="true"
            />
            <span class="nav-label">{{ item.label }}</span>
          </RouterLink>
          <RouterLink
            to="/settings"
            class="nav-link"
            active-class="selected"
            aria-label="设置"
          >
            <Settings
              :size="18"
              aria-hidden="true"
            />
            <span class="nav-label">设置</span>
          </RouterLink>
          <RouterLink
            to="/about"
            class="nav-link"
            active-class="selected"
            aria-label="关于与许可"
          >
            <Info
              :size="18"
              aria-hidden="true"
            />
            <span class="nav-label">关于与许可</span>
          </RouterLink>
        </nav>
        <div class="sidebar-bottom">
          <p>核心备份未配置</p>
          <small>完整素材备份不提供</small>
          <div class="local-user">{{ workspace.profile.displayName || '本机用户' }}</div>
        </div>
      </aside>
      <div class="workspace">
        <header class="topbar">
          <span>{{ route.meta.title }}</span>
          <GlobalSearch />
          <span
            class="local-status"
            :class="{ offline: !workspace.connected }"
          >
            <i aria-hidden="true" />
            {{ workspace.connected ? '本地模式' : '正在连接本地数据' }}
          </span>
        </header>
        <main
          id="main-content"
          ref="content"
          tabindex="-1"
        >
          <NAlert
            v-if="workspace.error"
            type="error"
            title="本地数据暂不可用"
            class="notice"
          >
            {{ workspace.error }}
            <NButton
              size="small"
              @click="workspace.load"
            >
              重试连接
            </NButton>
          </NAlert>
          <RouterView />
        </main>
      </div>
    </div>
  </NConfigProvider>
</template>
