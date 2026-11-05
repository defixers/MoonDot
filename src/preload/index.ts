import { contextBridge, ipcRenderer } from 'electron'
import {
  SYSTEM_HEALTH_CHANNEL,
  PROFILE_GET_CHANNEL,
  PROFILE_SAVE_CHANNEL,
} from '../shared/channels'
import type { MoonDotApi } from '../shared/system'

const api: MoonDotApi = {
  system: { health: () => ipcRenderer.invoke(SYSTEM_HEALTH_CHANNEL) },
  settings: {
    getProfile: () => ipcRenderer.invoke(PROFILE_GET_CHANNEL),
    saveProfile: (input) => ipcRenderer.invoke(PROFILE_SAVE_CHANNEL, input),
  },
}
contextBridge.exposeInMainWorld('moondot', api)
