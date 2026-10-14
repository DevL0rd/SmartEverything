import { constants } from 'node:fs';
import { open, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { CodexRuntimeError } from './errors';
export async function readWorkspaceFile(
  cwd: string,
  roots: readonly string[],
  path: string,
  limit: number,
): Promise<{ readonly path: string; readonly text: string; readonly truncated: boolean }> {
  const target = await realpath(isAbsolute(path) ? path : resolve(cwd, path));
  if (![cwd, ...roots].some((root) => within(root, target)))
    throw new CodexRuntimeError(
      'file',
      'This file is outside the selected computer job workspace roots.',
    );
  const approved = await stat(target);
  if (!approved.isFile())
    throw new CodexRuntimeError('file', 'The selected computer path is not a regular file.');
  const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const actual = await handle.stat();
    if (approved.dev !== actual.dev || approved.ino !== actual.ino)
      throw new CodexRuntimeError(
        'file',
        'The selected computer file changed identity during authorization.',
      );
    const bytes = Buffer.alloc(Math.min(limit, actual.size));
    const result = await handle.read(bytes, 0, bytes.length, 0);
    return {
      path: target,
      text: bytes.subarray(0, result.bytesRead).toString('utf8'),
      truncated: actual.size > limit,
    };
  } finally {
    await handle.close();
  }
}
function within(root: string, target: string): boolean {
  const path = relative(root, target);
  return (
    path === '' ||
    (path !== '..' && !path.startsWith('../') && !path.startsWith('..\\') && !isAbsolute(path))
  );
}
