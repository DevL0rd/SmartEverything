export class CodexRuntimeError extends Error {
  override readonly name = 'CodexRuntimeError';
  constructor(
    readonly operation: string,
    message: string,
    readonly uncertain = false,
  ) {
    super(message);
  }
}
export class CodexProtocolError extends Error {
  override readonly name = 'CodexProtocolError';
}
