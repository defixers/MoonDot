import type { IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import type { IpcResult } from '../../shared/system'
import { WorkError } from '../services/work-error'

export function isTrustedDocument(frameUrl: string, rendererUrl: string) {
  try {
    const frame = new URL(frameUrl)
    const allowed = new URL(rendererUrl)
    return (
      frame.protocol === allowed.protocol &&
      frame.host === allowed.host &&
      frame.pathname === allowed.pathname &&
      frame.search === allowed.search
    )
  } catch {
    return false
  }
}

export function validatedHandler<Input, Output>(
  schema: z.ZodType<Input>,
  action: (input: Input) => Output | Promise<Output>,
  trusted: (event: IpcMainInvokeEvent) => boolean,
  report: (error: unknown) => void,
) {
  return async (event: IpcMainInvokeEvent, input: unknown): Promise<IpcResult<Output>> => {
    if (!trusted(event))
      return { ok: false, error: { code: 'FORBIDDEN', message: '无法访问此操作' } }
    const parsed = schema.safeParse(input)
    if (!parsed.success)
      return { ok: false, error: { code: 'VALIDATION_FAILED', message: '输入内容不符合要求' } }
    try {
      return { ok: true, data: await action(parsed.data) }
    } catch (error) {
      if (error instanceof WorkError)
        return { ok: false, error: { code: error.code, message: error.message } }
      report(error)
      const code = String((error as { code?: unknown })?.code ?? '')
      return {
        ok: false,
        error: {
          code: code.includes('SQLITE_FULL') || code === 'ENOSPC' ? 'DISK_FULL' : 'DB_ERROR',
          message: '本地操作失败，请检查磁盘空间或应用日志',
        },
      }
    }
  }
}
