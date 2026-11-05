import type { WindowState } from '../../shared/settings'

interface Rectangle {
  x: number
  y: number
  width: number
  height: number
}
export function visibleWindowState(state: WindowState, workAreas: Rectangle[]): WindowState {
  const visible =
    state.x !== undefined &&
    state.y !== undefined &&
    workAreas.some(
      (area) =>
        Math.min(state.x! + state.width, area.x + area.width) - Math.max(state.x!, area.x) >= 100 &&
        state.y! >= area.y &&
        state.y! + 40 <= area.y + area.height,
    )
  return visible ? state : { width: state.width, height: state.height, maximized: state.maximized }
}
