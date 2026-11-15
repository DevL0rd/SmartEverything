function codeOf(cause: unknown): string | undefined {
  if (cause instanceof Error && 'code' in cause && typeof cause.code === 'string')
    return cause.code;
  return undefined;
}

export function isMissing(cause: unknown): boolean {
  return codeOf(cause) === 'ENOENT';
}

export function isPermission(cause: unknown): boolean {
  return codeOf(cause) === 'EPERM';
}

export function isGone(cause: unknown): boolean {
  const code = codeOf(cause);
  return code === 'ENOENT' || code === 'ESRCH';
}

export function isDenied(cause: unknown): boolean {
  const code = codeOf(cause);
  return code === 'EACCES' || code === 'EPERM';
}
