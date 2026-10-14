import { constants } from 'node:fs';
import { lstat, open, realpath, stat, type FileHandle } from 'node:fs/promises';
import { dirname, relative, isAbsolute, sep, extname, resolve } from 'node:path';
import { AI_PREVIEW_HTML_MAX } from '@smarteverything/domain';
import { HarnessRuntimeError } from '../host/errors';
export interface PreviewFileScope {
  readonly workspace: string;
  readonly path: string;
  readonly parent: string;
  readonly device: number;
  readonly inode: number;
}
export async function previewFileScope(workspace: string, path: string): Promise<PreviewFileScope> {
  const root = await realpath(workspace);
  const file = resolve(workspace, path);
  const inside = relative(root, file);
  if (
    root !== workspace ||
    inside === '' ||
    inside === '..' ||
    inside.startsWith(`..${sep}`) ||
    isAbsolute(inside) ||
    !['.html', '.htm'].includes(extname(file).toLowerCase())
  )
    throw new HarnessRuntimeError(
      'capability_unsupported',
      'File previews require an HTML file inside the current canonical workspace.',
    );
  const identity = await stat(root);
  return {
    workspace: root,
    path: file,
    parent: dirname(file),
    device: identity.dev,
    inode: identity.ino,
  };
}
export async function readPreviewFile(scope: PreviewFileScope): Promise<string> {
  const root = await realpath(scope.workspace);
  const identity = await stat(root);
  if (
    root !== scope.workspace ||
    identity.dev !== scope.device ||
    identity.ino !== scope.inode ||
    (await realpath(scope.path)) !== scope.path
  )
    throw new HarnessRuntimeError(
      'ownership_lost',
      'The HTML workspace or canonical file changed.',
    );
  const source = await lstat(scope.path);
  if (!source.isFile() || source.size > AI_PREVIEW_HTML_MAX)
    throw new HarnessRuntimeError(
      'ownership_lost',
      'The HTML source must be a bounded regular file.',
    );
  const file = await open(
    scope.path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    await requireOpenedFile(scope, file);
    return await boundedFileText(file);
  } finally {
    await file.close();
  }
}

async function boundedFileText(file: FileHandle): Promise<string> {
  const buffer = Buffer.alloc(AI_PREVIEW_HTML_MAX + 1);
  let length = 0;
  while (length < buffer.length) {
    const result = await file.read(buffer, length, buffer.length - length, length);
    if (result.bytesRead === 0) break;
    length += result.bytesRead;
  }
  if (length > AI_PREVIEW_HTML_MAX)
    throw new HarnessRuntimeError(
      'capability_unsupported',
      'The HTML exceeds the one-megabyte preview limit.',
    );
  return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length));
}

async function requireOpenedFile(scope: PreviewFileScope, file: FileHandle): Promise<void> {
  const opened = await file.stat();
  const resolved = await realpath(scope.path);
  const current = await stat(resolved);
  if (
    resolved !== scope.path ||
    current.dev !== opened.dev ||
    current.ino !== opened.ino ||
    !opened.isFile() ||
    opened.size > AI_PREVIEW_HTML_MAX
  )
    throw new HarnessRuntimeError(
      'ownership_lost',
      'The HTML source is not the exact bounded regular file that was authorized.',
    );
}
