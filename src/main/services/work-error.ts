export class WorkError extends Error {
  constructor(
    public readonly code: 'NOT_FOUND' | 'READ_ONLY' | 'CONFLICT' | 'INVALID_OPERATION',
    message: string,
  ) {
    super(message)
  }
}
