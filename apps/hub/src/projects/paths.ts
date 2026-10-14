import { constants, linkSync, lstatSync, realpathSync, renameSync, unlinkSync } from 'node:fs';
import { chmod, lstat, mkdir, open, realpath } from 'node:fs/promises';
import { dirname, join, parse, sep } from 'node:path';
import { ApiError, AI_PROJECT_PATH, AI_PROJECT_BYTES_MAX } from '@smarteverything/domain';
import { z } from 'zod';
import { HarnessFsError } from '@smarteverything/harness';
import type { ManagedProject } from '../store/repositories/ai-projects';
import type { Store } from '../store/store';

export function missing(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'ENOENT';
}
export function identity(info: {
  readonly dev: number | bigint;
  readonly ino: number | bigint;
}): string {
  return `${String(info.dev)}:${String(info.ino)}`;
}
export class ProjectPaths {
  readonly base: string;
  constructor(
    private readonly store: Store,
    dataDirectory: string,
  ) {
    this.base = join(dataDirectory, 'assistant', 'projects');
  }
  root(chat: string): string {
    return join(this.base, z.uuid().parse(chat));
  }
  async ensure(chat: string, profile: string, validate: () => void): Promise<string> {
    validate();
    const project = this.store.aiProjects.ensure(chat, profile);
    await this.privateBase();
    const root = this.root(chat);
    if (project.root_identity === null) await this.createRoot(root, project, validate);
    await this.verify(chat);
    validate();
    return root;
  }
  private async privateBase(): Promise<void> {
    await this.ancestors(this.base, true);
    await mkdir(this.base, { recursive: true, mode: 0o700 });
    await this.ancestors(this.base, false);
    await chmod(this.base, 0o700);
  }
  private async createRoot(
    root: string,
    project: ManagedProject,
    validate: () => void,
  ): Promise<void> {
    validate();
    try {
      await mkdir(root, { mode: 0o700 });
    } catch (cause) {
      if (!(cause instanceof Error && 'code' in cause && cause.code === 'EEXIST')) throw cause;
    }
    const info = await lstat(root);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new ApiError('forbidden', 'The managed chat root is not a plain directory.');
    await chmod(root, 0o700);
    for (const area of ['workspace', 'temporary', 'transfers']) {
      validate();
      await this.ancestors(join(root, area), true);
      await mkdir(join(root, area), { recursive: true, mode: 0o700 });
      await chmod(join(root, area), 0o700);
    }
    this.store.aiProjects.identify(project.chat_id, identity(info));
  }
  async verify(chat: string): Promise<void> {
    const project = this.store.aiProjects.find(chat);
    if (project?.root_identity === undefined || project.root_identity === null)
      throw new ApiError('conflict', 'The managed project root has not been initialized.');
    const root = this.root(chat);
    await this.ancestors(root, false);
    const info = await lstat(root);
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      (info.mode & 0o077) !== 0 ||
      identity(info) !== project.root_identity
    )
      throw new ApiError(
        'forbidden',
        'The managed project root was replaced; its files are unavailable.',
      );
    if ((await realpath(root)) !== root)
      throw new ApiError('forbidden', 'The managed root has a filesystem alias.');
  }
  async resolve(chat: string, relative: string, absent = false): Promise<string> {
    AI_PROJECT_PATH.parse(relative);
    await this.verify(chat);
    const path = join(this.root(chat), relative);
    await this.ancestors(path, absent);
    return path;
  }
  private async ancestors(path: string, absent: boolean): Promise<void> {
    const parsed = parse(path);
    let cursor = parsed.root;
    const parts = path.slice(parsed.root.length).split(sep);
    for (const [index, part] of parts.entries()) {
      cursor = join(cursor, part);
      let info;
      try {
        info = await lstat(cursor);
      } catch (cause) {
        if (absent && missing(cause)) return;
        throw cause;
      }
      plainEntry(info);
      if (index < parts.length - 1 && !info.isDirectory())
        throw new ApiError('invalid_request', 'A managed path ancestor is not a directory.');
    }
  }
  async bytes(
    chat: string,
    path: string,
    offset: number,
    options: { readonly length: number; readonly validate: () => void },
  ): Promise<{ readonly bytes: Buffer; readonly size: number; readonly version: string }> {
    options.validate();
    const absolute = await this.resolve(chat, path);
    const before = await lstat(absolute, { bigint: true });
    if (!before.isFile())
      throw new ApiError('invalid_request', 'Only regular project files can be read.');
    const handle = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await handle.stat({ bigint: true });
      if (identity(info) !== identity(before) || info.nlink !== 1n)
        throw new ApiError('forbidden', 'The managed file identity changed while opening it.');
      const buffer = Buffer.alloc(options.length);
      const read = await handle.read(buffer, 0, options.length, offset);
      const after = await handle.stat({ bigint: true });
      if (fileVersion(info) !== fileVersion(after))
        throw new ApiError(
          'conflict',
          'The project file changed during its read; read the current version again.',
        );
      options.validate();
      await this.verify(chat);
      options.validate();
      return {
        bytes: buffer.subarray(0, read.bytesRead),
        size: Number(info.size),
        version: fileVersion(info),
      };
    } finally {
      await handle.close();
    }
  }
  publish(
    chat: string,
    relative: string,
    input: {
      readonly staged: string;
      readonly version: string | null;
      readonly validate: () => void;
    },
  ): string {
    AI_PROJECT_PATH.parse(relative);
    AI_PROJECT_PATH.parse(input.staged);
    const root = this.root(chat);
    const project = this.store.aiProjects.find(chat);
    if (project?.root_identity === undefined || project.root_identity === null)
      throw new ApiError('conflict', 'The managed root has no publication identity.');
    syncAncestors(root, false);
    publicationRoot(root, project.root_identity);
    const absolute = join(root, relative);
    const staged = join(root, input.staged);
    syncAncestors(absolute, true);
    syncAncestors(staged, false);
    const file = observedVersion(absolute);
    if (file !== input.version)
      throw new HarnessFsError(
        'The managed file changed before text publication.',
        input.version === null ? 'FS_NOT_OBSERVED' : 'FS_STALE_VERSION',
      );
    const stagedInfo = lstatSync(staged);
    if (!stagedInfo.isFile() || stagedInfo.size > AI_PROJECT_BYTES_MAX)
      throw new ApiError(
        'forbidden',
        'Text publication requires a regular staged file of at most 25 MiB.',
      );
    input.validate();
    this.store.aiChats.assertWorkAllowed(chat);
    if (input.version === null) {
      linkSync(staged, absolute);
      unlinkSync(staged);
    } else renameSync(staged, absolute);
    return fileVersion(lstatSync(absolute, { bigint: true }));
  }
  async removal(chat: string): Promise<string> {
    await this.ancestors(this.base, true);
    const root = this.root(chat);
    let info;
    try {
      info = await lstat(root);
    } catch (cause) {
      if (missing(cause)) return root;
      throw cause;
    }
    const project = this.store.aiProjects.find(chat);
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      (project?.root_identity !== undefined &&
        project.root_identity !== null &&
        project.root_identity !== identity(info))
    )
      throw new ApiError(
        'forbidden',
        'The managed root was replaced; deleting it requires restoring its exact owned directory.',
      );
    return root;
  }
  async parent(chat: string, path: string): Promise<string> {
    const absolute = await this.resolve(chat, path, true);
    await mkdir(dirname(absolute), { recursive: true, mode: 0o700 });
    await this.ancestors(absolute, true);
    return absolute;
  }
}

function plainEntry(info: Awaited<ReturnType<typeof lstat>>): void {
  if (
    info.isSymbolicLink() ||
    (!info.isFile() && !info.isDirectory()) ||
    (info.isFile() && info.nlink !== 1)
  )
    throw new ApiError('forbidden', 'Managed project paths cannot use links or special files.');
}

function fileVersion(info: {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly size: bigint;
  readonly mtimeNs: bigint;
  readonly ctimeNs: bigint;
}): string {
  return [info.dev, info.ino, info.size, info.mtimeNs, info.ctimeNs].map(String).join(':');
}

function syncAncestors(path: string, absent: boolean): void {
  const parsed = parse(path);
  let cursor = parsed.root;
  const parts = path.slice(parsed.root.length).split(sep);
  for (const [index, part] of parts.entries()) {
    cursor = join(cursor, part);
    let info;
    try {
      info = lstatSync(cursor);
    } catch (cause) {
      if (absent && missing(cause)) return;
      throw cause;
    }
    plainEntry(info);
    if (index < parts.length - 1 && !info.isDirectory())
      throw new ApiError('invalid_request', 'A managed publication ancestor is not a directory.');
  }
}
function observedVersion(path: string): string | null {
  try {
    const info = lstatSync(path, { bigint: true });
    if (!info.isFile())
      throw new ApiError('invalid_request', 'A text publication target must be a regular file.');
    return fileVersion(info);
  } catch (cause) {
    if (missing(cause)) return null;
    throw cause;
  }
}

function publicationRoot(root: string, expected: string): void {
  const info = lstatSync(root);
  if (
    !info.isDirectory() ||
    (info.mode & 0o077) !== 0 ||
    identity(info) !== expected ||
    realpathSync(root) !== root
  )
    throw new ApiError('forbidden', 'The managed root changed before text publication.');
}
