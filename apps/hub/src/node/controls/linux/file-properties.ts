import { orElse } from './fs-fallback';
import { FILE_PROPERTIES, type FileProperties } from '@smarteverything/domain';
import { access, constants, readFile, readlink } from 'node:fs/promises';
import { basename } from 'node:path';
import { mimeOf } from '../home-files';
import type { FileScope } from './file-scope';

const MODE_MASK = 0o7777;

async function names(file: string): Promise<ReadonlyMap<number, string>> {
  const text = await orElse(readFile(file, 'utf8'), '');
  const found = new Map<number, string>();
  for (const line of text.split('\n')) {
    const [name = '', , id = ''] = line.split(':');
    if (name !== '' && id !== '') {
      found.set(Number(id), name);
    }
  }
  return found;
}

async function allowed(path: string, mode: number): Promise<boolean> {
  return access(path, mode).then(
    () => true,
    () => false,
  );
}

export class FilePropertiesReader {
  constructor(
    private readonly scope: FileScope,
    private readonly passwd = '/etc/passwd',
    private readonly group = '/etc/group',
  ) {}

  async read(path: string): Promise<FileProperties> {
    const { path: located, stats } = await this.scope.existing(path, false);
    const [users, groups] = await Promise.all([names(this.passwd), names(this.group)]);
    const kind = stats.isDirectory()
      ? 'folder'
      : stats.isSymbolicLink()
        ? 'link'
        : stats.isFile()
          ? 'file'
          : 'other';
    return FILE_PROPERTIES.parse({
      name: basename(located),
      path: located,
      kind,
      size: stats.size,
      mimeType: kind === 'file' ? (mimeOf(located) ?? 'application/octet-stream') : null,
      modifiedAt: stats.mtime.toISOString(),
      createdAt: stats.birthtimeMs > 0 ? stats.birthtime.toISOString() : null,
      owner: users.get(stats.uid) ?? String(stats.uid),
      group: groups.get(stats.gid) ?? String(stats.gid),
      permissions: {
        readable: await allowed(located, constants.R_OK),
        writable: await allowed(located, constants.W_OK),
        mode: stats.mode & MODE_MASK,
      },
      linkTarget: kind === 'link' ? await readlink(located) : null,
    });
  }
}
