import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Profile } from '../../shared/settings'

export const useWorkspaceStore = defineStore('workspace', () => {
  const profile = ref<Profile>({ displayName: '' })
  const connected = ref(false)
  const error = ref('')
  const loaded = ref(false)
  const version = ref('')
  async function load() {
    error.value = ''
    try {
      const [health, saved] = await Promise.all([
        window.moondot.system.health(),
        window.moondot.settings.getProfile(),
      ])
      if (!health.ok) throw new Error(health.error.message)
      if (!saved.ok) throw new Error(saved.error.message)
      profile.value = saved.data
      version.value = health.data.appVersion
      connected.value = true
      loaded.value = true
    } catch (cause) {
      connected.value = false
      error.value = cause instanceof Error ? cause.message : '本地数据暂时不可用'
    }
  }
  async function saveProfile(displayName: string) {
    const result = await window.moondot.settings.saveProfile({ displayName })
    if (!result.ok) throw new Error(result.error.message)
    profile.value = result.data
  }
  return { profile, connected, error, loaded, version, load, saveProfile }
})
