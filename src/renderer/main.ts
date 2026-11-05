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
