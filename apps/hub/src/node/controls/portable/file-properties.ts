import { FILE_PROPERTIES, type FileProperties } from '@smarteverything/domain';
import { access, constants, lstat, readlink } from 'node:fs/promises';
import { basename } from 'node:path';
import { NodeFailureError } from '../../node-failure';
import { fsCode } from '../../../fs-code';
import { mimeOf } from '../home-files';

const MODE_MASK = 0o7777;

async function allowed(path: string, mode: number): Promise<boolean> {
  return access(path, mode).then(
    () => true,
    () => false,
  );
}

export async function portableProperties(path: string): Promise<FileProperties> {
  const stats = await lstat(path).catch((cause: unknown) => {
    const code = fsCode(cause);
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw new NodeFailureError('not_found', 'That file or folder does not exist.');
    }
    if (code === 'EACCES' || code === 'EPERM') {
      throw new NodeFailureError('not_permitted', 'The signed-in user cannot read that.');
    }
    throw cause;
  });
  const kind = stats.isDirectory()
    ? 'folder'
    : stats.isSymbolicLink()
      ? 'link'
      : stats.isFile()
        ? 'file'
        : 'other';
  return FILE_PROPERTIES.parse({
    name: basename(path),
    path,
    kind,
    size: stats.size,
    mimeType: kind === 'file' ? (mimeOf(path) ?? 'application/octet-stream') : null,
    modifiedAt: stats.mtime.toISOString(),
    createdAt: stats.birthtimeMs > 0 ? stats.birthtime.toISOString() : null,
    owner: String(stats.uid),
    group: String(stats.gid),
    permissions: {
      readable: await allowed(path, constants.R_OK),
      writable: await allowed(path, constants.W_OK),
      mode: stats.mode & MODE_MASK,
    },
    linkTarget: kind === 'link' ? await readlink(path) : null,
  });
}
