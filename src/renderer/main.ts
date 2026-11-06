import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import '@fontsource-variable/inter'
import './styles/tokens.css'

const router = createRouter({
  history: createWebHashHistory(),
  scrollBehavior(to, from, savedPosition) {
    if (to.path === from.path) return false
    return savedPosition ?? { top: 0, left: 0, behavior: 'instant' }
  },
  routes: [
    { path: '/', component: () => import('./views/HomeView.vue'), meta: { title: '工作台' } },
    {
      path: '/projects',
      component: () => import('./views/ProjectsView.vue'),
      meta: { title: '项目' },
    },
    {
      path: '/projects/:id',
      component: () => import('./views/ProjectView.vue'),
      meta: { title: '项目详情' },
    },
    {
      path: '/trash',
      component: () => import('./views/ProjectsView.vue'),
      meta: { title: '项目回收站' },
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
