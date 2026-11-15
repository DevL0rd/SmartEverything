import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ApiError } from '@smarteverything/domain';
import { fsCode } from '../../fs-code';
import { derivedDirectory, type DerivedLayout } from '../pipeline/derived-paths';

const PREFIX = 'patch-';

const SUFFIX = '.png';

export class PatchStore {
  constructor(private readonly layout: DerivedLayout) {}

  private path(itemId: string, patchId: string): string {
    return join(derivedDirectory(this.layout, itemId), `${PREFIX}${patchId}${SUFFIX}`);
  }

  async write(itemId: string, patchId: string, png: Buffer): Promise<void> {
    const target = this.path(itemId, patchId);
    const staged = `${target}.${String(process.pid)}.partial`;
    await mkdir(derivedDirectory(this.layout, itemId), { recursive: true });
    try {
      await writeFile(staged, png);
      await rename(staged, target);
    } catch (cause) {
      await rm(staged, { force: true });
      throw cause;
    }
  }

  async read(itemId: string, patchId: string): Promise<Buffer> {
    try {
      return await readFile(this.path(itemId, patchId));
    } catch (cause) {
      if (fsCode(cause) === 'ENOENT') {
        throw new ApiError('not_found', 'An erased area of this edit is gone. Erase it again.');
      }
      throw cause;
    }
  }

  async keepOnly(itemId: string, keep: ReadonlySet<string>): Promise<void> {
    const directory = derivedDirectory(this.layout, itemId);
    let names: string[];
    try {
      names = await readdir(directory);
    } catch (cause) {
      if (fsCode(cause) === 'ENOENT') return;
      throw cause;
    }
    const stale = names.filter(
      (name) =>
        name.startsWith(PREFIX) &&
        name.endsWith(SUFFIX) &&
        !keep.has(name.slice(PREFIX.length, name.length - SUFFIX.length)),
    );
    await Promise.all(stale.map((name) => rm(join(directory, name), { force: true })));
  }
}
