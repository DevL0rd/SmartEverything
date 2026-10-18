import { cp, lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { NodeFailureError } from '../../node-failure';
import { fsCode } from '../../../fs-code';
import { sessionEnvironment } from './session-environment';
import { isMissing } from '../../../fs-util';

const INFO_SUFFIX = '.trashinfo';

const SAFE_ID = /^[^/\0]+$/;

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function trashStamp(date: Date): string {
  return date.toISOString().slice(0, 19);
}

function infoText(path: string, date: Date): string {
  return `[Trash Info]\nPath=${encodePath(path)}\nDeletionDate=${trashStamp(date)}\n`;
}

function originalPath(info: string): string | null {
  const match = /^Path=(.+)$/m.exec(info);
  return match?.[1] === undefined ? null : decodeURIComponent(match[1]);
}

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
  ) {
    this.root = join(dataHome, 'Trash');
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
    const target = originalPath(info);
    if (target === null) {
      throw new NodeFailureError('failed', 'The Trash does not know where that item came from.');
    }
    await this.place(join(this.root, 'files', id), target);
    await rm(infoFile, { force: true });
    return target;
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
