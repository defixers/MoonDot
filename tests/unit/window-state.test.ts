import { expect, it } from 'vitest'
import { visibleWindowState } from '../../src/main/infra/window-state'
it('keeps a reachable titlebar and recenters after a monitor is removed', () => {
  const state = { x: 2100, y: 80, width: 1280, height: 840, maximized: false }
  expect(visibleWindowState(state, [{ x: 1920, y: 0, width: 1920, height: 1080 }])).toEqual(state)
  expect(visibleWindowState(state, [{ x: 0, y: 0, width: 1920, height: 1080 }])).toEqual({
    width: 1280,
    height: 840,
    maximized: false,
  })
})
