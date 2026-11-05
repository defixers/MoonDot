import { contextBridge, ipcRenderer, webUtils } from 'electron'
import {
  SYSTEM_HEALTH_CHANNEL,
  PROFILE_GET_CHANNEL,
  PROFILE_SAVE_CHANNEL,
} from '../shared/channels'
import type { MoonDotApi } from '../shared/system'
import type { WorkApi } from '../shared/work'
import { workChannel, WORK_METHODS } from '../shared/channels'

const api: MoonDotApi = {
  pathsForFiles: (files) => files.map((file) => webUtils.getPathForFile(file)).filter(Boolean),
  work: Object.fromEntries(
    WORK_METHODS.map((method) => [
      method,
      (input: unknown) => ipcRenderer.invoke(workChannel(method), input),
    ]),
  ) as WorkApi,
  system: { health: () => ipcRenderer.invoke(SYSTEM_HEALTH_CHANNEL) },
  settings: {
    getProfile: () => ipcRenderer.invoke(PROFILE_GET_CHANNEL),
    saveProfile: (input) => ipcRenderer.invoke(PROFILE_SAVE_CHANNEL, input),
  },
}
contextBridge.exposeInMainWorld('moondot', api)
