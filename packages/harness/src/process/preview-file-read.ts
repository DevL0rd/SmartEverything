import { open, realpath } from 'node:fs/promises';
import { relative, isAbsolute, sep, extname, resolve } from 'node:path';
import { AI_PREVIEW_HTML_MAX } from '@smarteverything/domain';
import { HarnessRuntimeError } from '../host/errors';
export interface PreviewFileScope {
  readonly workspace: string;
  readonly path: string;
}
export async function previewFileScope(workspace: string, path: string): Promise<PreviewFileScope> {
  const root = await realpath(workspace);
  const file = await realpath(resolve(root, path));
  const inside = relative(root, file);
  if (
    inside === '' ||
    inside === '..' ||
    inside.startsWith(`..${sep}`) ||
    isAbsolute(inside) ||
    !['.html', '.htm'].includes(extname(file).toLowerCase())
  )
    throw new HarnessRuntimeError(
      'capability_unsupported',
      'File previews require an HTML file inside the current workspace.',
    );
  return { workspace: root, path: file };
}
export async function readPreviewFile(scope: PreviewFileScope): Promise<string> {
  const file = await open(scope.path, 'r');
  try {
    const { size } = await file.stat();
    if (size > AI_PREVIEW_HTML_MAX)
      throw new HarnessRuntimeError(
        'capability_unsupported',
        'The HTML exceeds the one-megabyte preview limit.',
      );
    return new TextDecoder('utf-8', { fatal: true }).decode(await file.readFile());
  } finally {
    await file.close();
  }
}
