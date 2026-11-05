import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import '@fontsource-variable/inter'
import './styles/tokens.css'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: () => import('./views/HomeView.vue'), meta: { title: '工作台' } },
    {
      path: '/projects',
      component: () => import('./views/ProjectsView.vue'),
      meta: { title: '项目' },
    },
    {
      path: '/projects/:id/:tab(overview|tasks|activity)',
      component: () => import('./views/ProjectView.vue'),
      meta: { title: '项目详情' },
    },
    { path: '/projects/:id', redirect: (to) => `/projects/${to.params.id}/overview` },
    {
      path: '/tasks',
      component: () => import('./views/TasksView.vue'),
      meta: { title: '我的任务' },
    },
    {
      path: '/templates',
      component: () => import('./views/TemplatesView.vue'),
      meta: { title: '阶段模板' },
    },
    {
      path: '/settings',
      component: () => import('./views/SettingsView.vue'),
      meta: { title: '设置' },
    },
    {
      path: '/about',
      component: () => import('./views/AboutView.vue'),
      meta: { title: '关于与许可' },
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
createApp(App).use(createPinia()).use(router).mount('#app')
