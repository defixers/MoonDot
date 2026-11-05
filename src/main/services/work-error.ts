export class WorkError extends Error {
  constructor(
    public readonly code:
      'NOT_FOUND' | 'READ_ONLY' | 'CONFLICT' | 'INVALID_OPERATION' | 'DIRECTORY_UNAVAILABLE',
    message: string,
  ) {
    super(message)
  }
}
