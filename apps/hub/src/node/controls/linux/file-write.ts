import { orElse } from './fs-fallback';
import type { FileWriteChange, FileWriteResult } from '@smarteverything/domain';
import { cp, lstat, mkdir, rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { NodeFailureError } from '../../node-failure';
import { contains, failureOfFs, type FileScope, type Located } from './file-scope';
import { moveAcrossDevices, type XdgTrash } from './trash';
import { messageOf } from '@smarteverything/logging';

type Done = FileWriteResult['done'][number];

type Failed = FileWriteResult['failed'][number];

type Outcome = Pick<Done, 'newPath' | 'trashId'> & { readonly path?: string };

const DOT_NAMES: ReadonlySet<string> = new Set(['.', '..']);

function reasonOf(cause: unknown): string {
  try {
    return failureOfFs(cause, 'change');
  } catch (failure) {
    return messageOf(failure);
  }
}

async function exists(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    () => false,
  );
}

export class FileWriter {
  constructor(
    private readonly scope: FileScope,
    private readonly trash: XdgTrash,
  ) {}

  async write(change: FileWriteChange): Promise<FileWriteResult> {
    switch (change.action) {
      case 'new_folder':
        return this.each([change.path], (path) => this.newFolder(path));
      case 'rename':
        return this.each([change.path], (path) => this.rename(path, change.name));
      case 'move':
        return this.each(change.paths, (path) =>
          this.transfer(path, change.to, change.replace, true),
        );
      case 'copy':
        return this.each(change.paths, (path) =>
          this.transfer(path, change.to, change.replace, false),
        );
      case 'trash':
        return this.each(change.paths, (path) => this.trashOne(path));
      case 'restore':
        return this.each(change.items, (item) => this.restore(item));
    }
  }

  private async each(
    items: readonly string[],
    work: (item: string) => Promise<Outcome>,
  ): Promise<FileWriteResult> {
    const done: Done[] = [];
    const failed: Failed[] = [];
    for (const item of items) {
      try {
        const outcome = await work(item);
        done.push({
          path: outcome.path ?? item,
          newPath: outcome.newPath,
          trashId: outcome.trashId,
        });
      } catch (cause) {
        failed.push({ path: item, reason: reasonOf(cause) });
      }
    }
    return { done, failed };
  }

  private async newFolder(path: string): Promise<Outcome> {
    const placed = await this.scope.place(path);
    await mkdir(placed).catch((cause: unknown) => failureOfFs(cause, 'create'));
    return { newPath: placed, trashId: null };
  }

  private async rename(path: string, name: string): Promise<Outcome> {
    if (DOT_NAMES.has(name)) {
      throw new NodeFailureError('not_permitted', 'That name is not allowed.');
    }
    const source = await this.scope.existing(path, true);
    const target = join(dirname(source.path), name);
    if (await exists(target)) {
      throw new NodeFailureError('failed', 'Something with that name is already there.');
    }
    await rename(source.path, target).catch((cause: unknown) => failureOfFs(cause, 'rename'));
    return { newPath: target, trashId: null };
  }

  private async transfer(
    path: string,
    to: string,
    replace: boolean,
    move: boolean,
  ): Promise<Outcome> {
    const source = await this.scope.existing(path, move);
    const folder = await this.scope.folder(to);
    const target = join(folder, basename(source.path));
    if (source.stats.isDirectory() && contains(source.path, folder)) {
      throw new NodeFailureError('failed', 'A folder cannot go inside itself.');
    }
    if (source.path === target) {
      throw new NodeFailureError('failed', 'That is already in this folder.');
    }
    await this.clearTarget(source, target, replace);
    await this.carry(source.path, target, move).catch((cause: unknown) =>
      failureOfFs(cause, move ? 'move' : 'copy'),
    );
    return { newPath: target, trashId: null };
  }

  private async clearTarget(source: Located, target: string, replace: boolean): Promise<void> {
    const present = await orElse(lstat(target), null);
    if (present === null) {
      return;
    }
    if (!replace) {
      throw new NodeFailureError('failed', 'Something with that name is already there.');
    }
    if (present.isDirectory() || source.stats.isDirectory()) {
      throw new NodeFailureError('failed', 'Only files can be replaced, not folders.');
    }
    await rm(target).catch((cause: unknown) => failureOfFs(cause, 'replace'));
  }

  private async carry(from: string, to: string, move: boolean): Promise<void> {
    if (move) {
      await moveAcrossDevices(from, to);
      return;
    }
    await cp(from, to, {
      recursive: true,
      errorOnExist: true,
      force: false,
      verbatimSymlinks: true,
    });
  }

  private async trashOne(path: string): Promise<Outcome> {
    const source = await this.scope.existing(path, true);
    if (contains(this.trash.root, source.path)) {
      throw new NodeFailureError('failed', 'That is already in the Trash.');
    }
    const trashId = await this.trash
      .put(source.path)
      .catch((cause: unknown) => failureOfFs(cause, 'trash'));
    return { newPath: null, trashId };
  }

  private async restore(item: string): Promise<Outcome> {
    const path = await this.trash.restore(item);
    return { path, newPath: null, trashId: item };
  }
}
