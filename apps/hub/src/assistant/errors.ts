export function errorCode(cause: unknown): unknown {
  return cause instanceof Error && 'code' in cause ? cause.code : undefined;
}

export function isMissing(cause: unknown): boolean {
  const code = errorCode(cause);
  return code === 'ENOENT' || code === 'ENOTDIR';
}

export function isUnreadableJson(cause: unknown): boolean {
  return cause instanceof SyntaxError || isMissing(cause);
}
