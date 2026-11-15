import { cp, lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { NodeFailureError } from '../../node-failure';
import { fsCode } from '../../../fs-code';
import { sessionEnvironment } from './session-environment';
import { isMissing } from '../../../fs-util';

const INFO_SUFFIX = '.trashinfo';

const SAFE_ID = /^[^/\0]+$/;

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function trashStamp(date: Date): string {
  const day = `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function infoText(path: string, date: Date): string {
  return `[Trash Info]\nPath=${encodePath(path)}\nDeletionDate=${trashStamp(date)}\n`;
}

export interface TrashInfo {
  readonly path: string;
  readonly deletedAt: Date | null;
}

function localMoment(stamp: string | undefined): Date | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(stamp ?? '')?.slice(1);
  if (parts === undefined) {
    return null;
  }
  const [year = 0, month = 1, day = 1, hour = 0, minute = 0, second = 0] = parts.map(Number);
  return new Date(year, month - 1, day, hour, minute, second);
}

function decoded(path: string): string | null {
  try {
    return decodeURIComponent(path);
  } catch (cause) {
    if (cause instanceof URIError) {
      return null;
    }
    throw cause;
  }
}

export function readTrashInfo(info: string): TrashInfo | null {
  const recorded = /^Path=(.+)$/m.exec(info)?.[1];
  const path = recorded === undefined ? null : decoded(recorded);
  if (path === null) {
    return null;
  }
  return { path, deletedAt: localMoment(/^DeletionDate=(.+)$/m.exec(info)?.[1]) };
}

export const TRASH_INFO_SUFFIX = INFO_SUFFIX;

export async function moveAcrossDevices(from: string, to: string): Promise<void> {
  try {
    await rename(from, to);
  } catch (cause) {
    if (fsCode(cause) !== 'EXDEV') {
      throw cause;
    }
    await cp(from, to, {
      recursive: true,
      errorOnExist: true,
      force: false,
      verbatimSymlinks: true,
    });
    await rm(from, { recursive: true, force: true });
  }
}

export class XdgTrash {
  readonly root: string;

  constructor(
    dataHome: string = sessionEnvironment().XDG_DATA_HOME ?? join(homedir(), '.local', 'share'),
    private readonly now: () => Date = () => new Date(),
    bin = 'Trash',
    private readonly topdir: string | null = null,
  ) {
    this.root = join(dataHome, bin);
  }

  originalOf(recorded: string): string {
    return this.topdir === null ? recorded : resolve(this.topdir, recorded);
  }

  async put(path: string): Promise<string> {
    await mkdir(join(this.root, 'files'), { recursive: true, mode: 0o700 });
    await mkdir(join(this.root, 'info'), { recursive: true, mode: 0o700 });
    const id = await this.claim(path);
    try {
      await moveAcrossDevices(path, join(this.root, 'files', id));
    } catch (cause) {
      await rm(join(this.root, 'info', `${id}${INFO_SUFFIX}`), { force: true });
      throw cause;
    }
    return id;
  }

  async restore(id: string): Promise<string> {
    if (!SAFE_ID.test(id) || id === '.' || id === '..') {
      throw new NodeFailureError('not_found', 'That item is not in the Trash.');
    }
    const infoFile = join(this.root, 'info', `${id}${INFO_SUFFIX}`);
    const info = await readFile(infoFile, 'utf8').catch((cause: unknown) => {
      if (isMissing(cause)) {
        throw new NodeFailureError('not_found', 'That item is not in the Trash.');
      }
      throw cause;
    });
    const recorded = readTrashInfo(info);
    if (recorded === null) {
      throw new NodeFailureError('failed', 'The Trash does not know where that item came from.');
    }
    const target = this.originalOf(recorded.path);
    await this.place(join(this.root, 'files', id), target);
    await rm(infoFile, { force: true });
    return target;
  }

  async forget(id: string): Promise<string> {
    if (!SAFE_ID.test(id) || id === '.' || id === '..') {
      throw new NodeFailureError('not_found', 'That item is not in the Trash.');
    }
    const infoFile = join(this.root, 'info', `${id}${INFO_SUFFIX}`);
    const info = await readFile(infoFile, 'utf8').catch((cause: unknown) => {
      if (isMissing(cause)) {
        throw new NodeFailureError('not_found', 'That item is not in the Trash.');
      }
      throw cause;
    });
    const recorded = readTrashInfo(info);
    const original =
      recorded === null ? join(this.root, 'files', id) : this.originalOf(recorded.path);
    await rm(join(this.root, 'files', id), { recursive: true, force: true });
    await rm(infoFile, { force: true });
    return original;
  }

  private async place(from: string, target: string): Promise<void> {
    const present = await lstat(target).then(
      () => true,
      () => false,
    );
    if (present) {
      throw new NodeFailureError('failed', 'Something with that name is already there.');
    }
    await mkdir(dirname(target), { recursive: true });
    await moveAcrossDevices(from, target);
  }

  private async claim(path: string): Promise<string> {
    const name = path.slice(path.lastIndexOf('/') + 1);
    for (let attempt = 0; ; attempt += 1) {
      const id = attempt === 0 ? name : `${name}.${String(attempt)}`;
      const orphan = await lstat(join(this.root, 'files', id)).then(
        () => true,
        () => false,
      );
      if (orphan) {
        continue;
      }
      const taken = await writeFile(
        join(this.root, 'info', `${id}${INFO_SUFFIX}`),
        infoText(path, this.now()),
        { flag: 'wx' },
      ).then(
        () => false,
        (cause: unknown) => {
          if (fsCode(cause) === 'EEXIST') {
            return true;
          }
          throw cause;
        },
      );
      if (!taken) {
        return id;
      }
    }
  }
}
