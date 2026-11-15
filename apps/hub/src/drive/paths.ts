import { AsyncLocalStorage } from 'node:async_hooks';
import { constants } from 'node:fs';
import { lstat, open, realpath, stat } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { fsCode } from '../fs-code';
import { isMissing } from '../fs-util';

export type DrivePathFailure =
  'invalid' | 'escape' | 'missing' | 'changed' | 'not-directory' | 'denied';

export class DrivePathError extends Error {
  override readonly name = 'DrivePathError';

  constructor(
    readonly failure: DrivePathFailure,
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause });
  }
}

export interface FileIdentity {
  readonly dev: bigint;
  readonly ino: bigint;
}

export interface ResolvedPath {
  readonly root: string;
  readonly relative: string;
  readonly absolute: string;
  readonly identity: FileIdentity | null;
}

export type OpenMode = 'read' | 'write' | 'readwrite';

export const ORPHAN_DIRECTORY = '.se-orphans';

export function isOrphanPath(relPath: string): boolean {
  return relPath === ORPHAN_DIRECTORY || relPath.startsWith(`${ORPHAN_DIRECTORY}/`);
}

const OPEN_FLAGS: Readonly<Record<OpenMode, number>> = {
  read: constants.O_RDONLY | constants.O_NONBLOCK,
  write: constants.O_WRONLY | constants.O_NONBLOCK,
  readwrite: constants.O_RDWR | constants.O_NONBLOCK,
};

export function isInside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

export function normalizeRelativePath(input: string): string {
  const normalized = input.normalize('NFC');
  if (normalized.includes('\0')) {
    throw new DrivePathError('invalid', 'A path cannot contain a NUL character.');
  }
  if (normalized === '') {
    return '';
  }
  if (normalized.startsWith('/')) {
    throw new DrivePathError('invalid', 'A drive path must be relative to its root.');
  }
  for (const segment of normalized.split('/')) {
    if (segment === '' || segment === '.' || segment === '..') {
      throw new DrivePathError('invalid', `A drive path cannot contain the segment "${segment}".`);
    }
  }
  return normalized;
}

export function decodeRequestPath(raw: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch (cause) {
    throw new DrivePathError('invalid', 'The path is not valid percent-encoding.', cause);
  }
  return normalizeRelativePath(decoded);
}

const PATH_MAX_BYTES = 4095;

const O_PATH = 0o10_000_000;

const WALK_FLAGS = O_PATH | constants.O_DIRECTORY | constants.O_NOFOLLOW;

export class PathScope {
  #handles: FileHandle[] = [];
  #closed = false;

  hold(handle: FileHandle): void {
    if (this.#closed) throw new Error('A path scope cannot hold a handle after it closed.');
    this.#handles.push(handle);
  }

  get held(): number {
    return this.#handles.length;
  }

  async close(): Promise<void> {
    this.#closed = true;
    const handles = this.#handles;
    this.#handles = [];
    await Promise.all(handles.map((handle) => handle.close()));
  }
}

const scopes = new AsyncLocalStorage<PathScope>();

export async function withPathScope<T>(operation: () => Promise<T>): Promise<T> {
  if (scopes.getStore() !== undefined) return operation();
  const scope = new PathScope();
  try {
    return await scopes.run(scope, operation);
  } finally {
    await scope.close();
  }
}

function fits(path: string): boolean {
  return Buffer.byteLength(path) <= PATH_MAX_BYTES;
}

function within(handle: FileHandle, rest: readonly string[]): string {
  return [`/proc/self/fd/${String(handle.fd)}`, ...rest].join('/');
}

function walkFailure(code: string | undefined, cause: unknown): DrivePathError | undefined {
  if (code === 'ELOOP') {
    return new DrivePathError(
      'escape',
      'The path goes through a symlink; the hub never follows links.',
    );
  }
  if (code === 'EACCES' || code === 'EPERM') {
    return new DrivePathError('denied', 'The path cannot be read.', cause);
  }
  return undefined;
}

async function stepInto(parent: FileHandle, name: string): Promise<FileHandle | null> {
  const path = within(parent, [name]);
  try {
    return await open(path, WALK_FLAGS);
  } catch (cause) {
    const code = fsCode(cause);
    if (code === 'ENOENT') return null;
    if (code === 'ENOTDIR') {
      const entry = await lstat(path);
      throw entry.isSymbolicLink()
        ? new DrivePathError(
            'escape',
            'The path goes through a symlink; the hub never follows links.',
          )
        : new DrivePathError('not-directory', 'A parent of the path is not a directory.');
    }
    throw walkFailure(code, cause) ?? cause;
  }
}

interface Walked {
  readonly anchor: FileHandle;
  readonly depth: number;
}

async function walkFolders(root: string, folders: readonly string[]): Promise<Walked> {
  let current = await open(root, WALK_FLAGS);
  let depth = 0;
  try {
    for (const name of folders) {
      const next = await stepInto(current, name);
      if (next === null) break;
      await current.close();
      current = next;
      depth += 1;
    }
  } catch (cause) {
    await current.close();
    throw cause;
  }
  return { anchor: current, depth };
}

async function lastEntry(
  anchor: FileHandle,
  name: string,
): Promise<{ readonly identity: FileIdentity | null }> {
  try {
    const entry = await lstat(within(anchor, [name]), { bigint: true });
    if (entry.isSymbolicLink()) {
      throw new DrivePathError('escape', 'The path is a symlink; the hub never follows links.');
    }
    return { identity: { dev: entry.dev, ino: entry.ino } };
  } catch (cause) {
    if (isMissing(cause)) return { identity: null };
    throw walkFailure(fsCode(cause), cause) ?? cause;
  }
}

function addressOf(
  root: string,
  segments: readonly string[],
  walked: Walked,
): { readonly address: string; readonly held: boolean } {
  const lexical = segments.length === 0 ? root : join(root, ...segments);
  if (fits(lexical)) return { address: lexical, held: false };
  const scope = scopes.getStore();
  if (scope === undefined) {
    throw new DrivePathError(
      'invalid',
      `The path is longer than ${String(PATH_MAX_BYTES)} bytes on the Hub disk and no file operation holds its folders open.`,
    );
  }
  const address = within(walked.anchor, segments.slice(walked.depth));
  if (!fits(address)) {
    throw new DrivePathError(
      'invalid',
      'The missing part of the path is longer than the disk allows.',
    );
  }
  scope.hold(walked.anchor);
  return { address, held: true };
}

async function identityOf(path: string): Promise<FileIdentity> {
  const { dev, ino } = await stat(path, { bigint: true });
  return { dev, ino };
}

async function rootOf(rootPath: string): Promise<string> {
  return realpath(rootPath).catch((cause: unknown) => {
    if (fsCode(cause) === 'ENOENT') {
      throw new DrivePathError('missing', 'The root directory does not exist.');
    }
    throw cause;
  });
}

export async function resolveInRoot(rootPath: string, input: string): Promise<ResolvedPath> {
  const normalized = normalizeRelativePath(input);
  const root = await rootOf(rootPath);
  const segments = normalized === '' ? [] : normalized.split('/');
  const name = segments.at(-1);
  const walked = await walkFolders(root, name === undefined ? [] : segments.slice(0, -1));
  let held = false;
  try {
    const identity =
      name === undefined
        ? await identityOf(root)
        : walked.depth < segments.length - 1
          ? null
          : (await lastEntry(walked.anchor, name)).identity;
    const placed = addressOf(root, segments, walked);
    held = placed.held;
    return { root, relative: normalized, absolute: placed.address, identity };
  } finally {
    if (!held) await walked.anchor.close();
  }
}

export async function locateInRoot(rootPath: string, input: string): Promise<string> {
  const normalized = normalizeRelativePath(input);
  const root = await rootOf(rootPath);
  const segments = normalized === '' ? [] : normalized.split('/');
  const walked = await walkFolders(root, segments.slice(0, -1));
  let held = false;
  try {
    const placed = addressOf(root, segments, walked);
    held = placed.held;
    return placed.address;
  } finally {
    if (!held) await walked.anchor.close();
  }
}

export async function openResolved(resolved: ResolvedPath, mode: OpenMode): Promise<FileHandle> {
  const expected = resolved.identity;
  if (expected === null) {
    throw new DrivePathError('missing', 'The path does not exist.');
  }
  let handle: FileHandle;
  try {
    handle = await open(resolved.absolute, OPEN_FLAGS[mode] | constants.O_NOFOLLOW);
  } catch (cause) {
    if (fsCode(cause) === 'ELOOP') {
      throw new DrivePathError('escape', 'The path was replaced by a symlink.');
    }
    throw cause;
  }
  try {
    const opened = await handle.stat({ bigint: true });
    if (opened.dev !== expected.dev || opened.ino !== expected.ino) {
      throw new DrivePathError('changed', 'The path changed between resolving and opening.');
    }
    if (!opened.isFile()) {
      throw new DrivePathError('invalid', 'The path is not a regular file.');
    }
  } catch (cause) {
    await handle.close();
    throw cause;
  }
  return handle;
}
