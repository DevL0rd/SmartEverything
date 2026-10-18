import type { DownloadChunk, DownloadPlan, DownloadSkipped } from '@smarteverything/domain';
import mime from 'mime-types';
import { randomUUID } from 'node:crypto';
import { constants, type Dirent } from 'node:fs';
import { access, lstat, readdir, realpath, stat } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { fsCode } from '../../../fs-code';
import { NodeFailureError } from '../../node-failure';
import { failureOfFs, type FileScope } from './file-scope';
import { orElse, UNREADABLE } from './fs-fallback';
import { mimeOf } from '../home-files';
import { zipChunks, type ZipEntry } from './zip-stream';

const IDLE_EXPIRY_MS = 10 * 60_000;
const PSEUDO_FOLDERS: ReadonlySet<string> = new Set(['/proc', '/sys', '/dev']);
const PACKED: ReadonlySet<string> = new Set(
  [
    'zip gz tgz bz2 xz zst 7z rar jar apk',
    'jpg jpeg png gif webp avif heic',
    'mp3 m4a aac ogg opus flac mp4 m4v mkv webm mov avi',
  ]
    .join(' ')
    .split(' ')
    .map((extension) => `.${extension}`),
);
const LINK_GONE: readonly string[] = [...UNREADABLE, 'ELOOP'];
const SKIPPED_NAME = 'Not included.txt';

export interface DownloadClock {
  readonly now: () => number;
  readonly newId: () => string;
}

const REAL_CLOCK: DownloadClock = { now: Date.now, newId: randomUUID };

interface Session {
  readonly entries: readonly ZipEntry[];
  iterator: AsyncGenerator<Buffer> | null;
  carry: Buffer;
  touchedAt: number;
}

function reasonOf(cause: unknown): string {
  const code = fsCode(cause);
  if (code === 'ENOENT') {
    return 'It is no longer there.';
  }
  if (code === 'EACCES' || code === 'EPERM') {
    return 'The signed-in user has no permission to read it.';
  }
  return cause instanceof Error ? cause.message : 'It could not be read.';
}

function entryName(prefix: string, name: string): string {
  return prefix === '' ? name : `${prefix}/${name}`;
}

async function readableFile(path: string): Promise<void> {
  await access(path, constants.R_OK);
}

class Gatherer {
  readonly entries: ZipEntry[] = [];
  readonly skipped: DownloadSkipped[] = [];
  files = 0;
  folders = 0;
  bytes = 0;

  async root(path: string, name: string): Promise<void> {
    try {
      const info = await stat(path);
      if (info.isDirectory()) {
        await this.folder(await realpath(path), name);
      } else if (info.isFile()) {
        await this.file(path, name);
      } else {
        this.skip(path, 'A special file, not a document.');
      }
    } catch (cause) {
      this.skip(path, reasonOf(cause));
    }
  }

  private skip(path: string, reason: string): void {
    this.skipped.push({ path, reason });
  }

  private async file(path: string, name: string): Promise<void> {
    try {
      const stats = await stat(path);
      await readableFile(path);
      this.entries.push({
        kind: 'file',
        name,
        source: path,
        size: stats.size,
        mtime: stats.mtime,
        mode: stats.mode,
        compress: !PACKED.has(extname(path).toLowerCase()),
      });
      this.files += 1;
      this.bytes += stats.size;
    } catch (cause) {
      this.skip(path, reasonOf(cause));
    }
  }

  private async link(path: string, name: string): Promise<void> {
    const target = await orElse(stat(path), null, LINK_GONE);
    if (target === null) {
      this.skip(path, 'A link to something that is gone.');
    } else if (target.isFile()) {
      await this.file(path, name);
    } else if (target.isDirectory()) {
      this.skip(path, 'A link to a folder; links to folders are not followed.');
    } else {
      this.skip(path, 'A special file, not a document.');
    }
  }

  private async folder(path: string, name: string): Promise<void> {
    if (PSEUDO_FOLDERS.has(path)) {
      this.skip(path, 'A system folder with no real files.');
      return;
    }
    const children = await readdir(path, { withFileTypes: true }).catch((cause: unknown) => {
      this.skip(path, reasonOf(cause));
      return null;
    });
    if (children === null) {
      return;
    }
    const own = await lstat(path);
    this.entries.push({ kind: 'folder', name: `${name}/`, mtime: own.mtime, mode: own.mode });
    this.folders += 1;
    for (const child of children.sort((left, right) => left.name.localeCompare(right.name))) {
      await this.child(join(path, child.name), entryName(name, child.name), child);
    }
  }

  private async child(path: string, name: string, kind: Dirent): Promise<void> {
    if (kind.isDirectory()) {
      await this.folder(path, name);
    } else if (kind.isFile()) {
      await this.file(path, name);
    } else if (kind.isSymbolicLink()) {
      await this.link(path, name);
    } else {
      this.skip(path, 'A special file, not a document.');
    }
  }
}

function looked(path: string): string {
  const type = mime.lookup(path);
  return type === false ? 'application/octet-stream' : type;
}

function uniqueName(taken: Set<string>, wanted: string): string {
  const extension = extname(wanted);
  const stem = wanted.slice(0, wanted.length - extension.length);
  let name = wanted;
  for (let copy = 2; taken.has(name); copy += 1) {
    name = `${stem} (${String(copy)})${extension}`;
  }
  taken.add(name);
  return name;
}

function zipNameOf(roots: readonly string[]): string {
  const [first = '/'] = roots;
  if (roots.length === 1) {
    return `${basename(first) === '' ? 'Computer' : basename(first)}.zip`;
  }
  const parents = new Set(roots.map((root) => dirname(root)));
  const [parent = '/'] = parents;
  return parents.size === 1 && basename(parent) !== '' ? `${basename(parent)}.zip` : 'Files.zip';
}

function skippedNote(skipped: readonly DownloadSkipped[], at: Date): ZipEntry[] {
  if (skipped.length === 0) {
    return [];
  }
  const lines = skipped.map((item) => `${item.path}\n  ${item.reason}`);
  return [
    {
      kind: 'text',
      name: SKIPPED_NAME,
      text: `These items could not be added to this download:\n\n${lines.join('\n\n')}\n`,
      mtime: at,
    },
  ];
}

export class FileDownloads {
  private readonly sessions = new Map<string, Session>();

  constructor(
    private readonly scope: FileScope,
    private readonly clock: DownloadClock = REAL_CLOCK,
  ) {}

  async open(paths: readonly string[]): Promise<DownloadPlan> {
    await this.expire();
    const roots = paths.map((path) => this.scope.lexical(path));
    const [only] = roots;
    if (roots.length === 1 && only !== undefined) {
      const single = await this.singleFile(only);
      if (single !== null) {
        return single;
      }
    }
    const gathered = await this.gather(roots);
    if (gathered.entries.length === 0) {
      throw new NodeFailureError(
        'not_permitted',
        gathered.skipped[0]?.reason ?? 'There is nothing in that to download.',
      );
    }
    const entries = [
      ...gathered.entries,
      ...skippedNote(gathered.skipped, new Date(this.clock.now())),
    ];
    const id = this.clock.newId();
    this.sessions.set(id, {
      entries,
      iterator: null,
      carry: Buffer.alloc(0),
      touchedAt: this.clock.now(),
    });
    return {
      kind: 'zip',
      id,
      name: zipNameOf(roots),
      files: gathered.files,
      folders: gathered.folders,
      bytes: gathered.bytes,
      skipped: gathered.skipped,
    };
  }

  async read(id: string, length: number): Promise<DownloadChunk> {
    await this.expire();
    const session = this.sessions.get(id);
    if (session === undefined) {
      throw new NodeFailureError('not_found', 'This download is no longer open; start it again.');
    }
    session.touchedAt = this.clock.now();
    session.iterator ??= zipChunks(session.entries);
    const parts: Buffer[] = [session.carry];
    let have = session.carry.length;
    let finished = false;
    try {
      while (have < length && !finished) {
        const next = await session.iterator.next();
        finished = next.done === true;
        if (next.done !== true) {
          parts.push(next.value);
          have += next.value.length;
        }
      }
    } catch (cause) {
      await this.drop(id);
      throw new NodeFailureError(
        'failed',
        `The download stopped: ${cause instanceof Error ? cause.message : 'a file could not be read'}.`,
      );
    }
    const joined = Buffer.concat(parts);
    session.carry = joined.subarray(length);
    const done = finished && session.carry.length === 0;
    if (done) {
      this.sessions.delete(id);
    }
    return { data: joined.subarray(0, length).toString('base64'), done };
  }

  async close(id: string): Promise<void> {
    await this.drop(id);
  }

  private async singleFile(path: string): Promise<DownloadPlan | null> {
    const real = await realpath(path).catch((cause: unknown) => failureOfFs(cause, 'reach'));
    const stats = await stat(real).catch((cause: unknown) => failureOfFs(cause, 'read'));
    if (!stats.isFile()) {
      return null;
    }
    await readableFile(real).catch((cause: unknown) => failureOfFs(cause, 'read'));
    return {
      kind: 'file',
      path: real,
      name: basename(path),
      size: stats.size,
      mimeType: mimeOf(real) ?? looked(real),
      files: 1,
      folders: 0,
      bytes: stats.size,
      skipped: [],
    };
  }

  private async gather(roots: readonly string[]): Promise<Gatherer> {
    const gathered = new Gatherer();
    const taken = new Set<string>();
    for (const root of roots) {
      await gathered.root(
        root,
        uniqueName(taken, basename(root) === '' ? 'Computer' : basename(root)),
      );
    }
    return gathered;
  }

  private async drop(id: string): Promise<void> {
    const session = this.sessions.get(id);
    this.sessions.delete(id);
    await session?.iterator?.return(undefined);
  }

  private async expire(): Promise<void> {
    const stale = [...this.sessions].filter(
      ([, session]) => this.clock.now() - session.touchedAt > IDLE_EXPIRY_MS,
    );
    await Promise.all(stale.map(([id]) => this.drop(id)));
  }
}
