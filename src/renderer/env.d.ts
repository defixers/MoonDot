import type { MoonDotApi } from '../shared/system'

declare global {
  interface Window {
    moondot: MoonDotApi
  }
}
