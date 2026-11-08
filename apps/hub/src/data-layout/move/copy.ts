import { constants } from 'node:fs';
import { chmod, copyFile, lutimes, mkdir, readlink, rm, symlink, utimes } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Worker } from 'node:worker_threads';
import type { MoveArea } from './areas';
import { ManifestWriter, writeMoveMarker, type ManifestEntry } from './manifest';
import { countPrefix, SCAN_RESPONSE, type ScanRequest, type ScanResponse } from './prefix-scan';
import { lstatIfPresent, walkHubEntries, type WalkEntry } from './walk';

const PERMISSION_BITS = 0o7777;
const MS_PER_SECOND = 1000;

export class MoveCopyError extends Error {
  override readonly name = 'MoveCopyError';

  constructor(
    readonly relPath: string,
    readonly code: string,
  ) {
    super(`could not read ${relPath} after copying it (${code})`);
  }
}

export interface CopyProgress {
  readonly files: number;
  readonly bytes: number;
  readonly area: MoveArea;
  readonly relPath: string;
}

export interface AreaTotals {
  readonly files: number;
  readonly bytes: number;
}

export interface CopySummary {
  readonly files: number;
  readonly directories: number;
  readonly links: number;
  readonly special: number;
  readonly bytes: number;
  readonly unstable: number;
  readonly prefixHits: number;
  readonly areas: Readonly<Record<MoveArea, AreaTotals>>;
}

export interface CopyOperations {
  readonly copyFile: (source: string, target: string, mode: number) => Promise<void>;
}

const NODE_COPY_OPERATIONS: CopyOperations = { copyFile };

export interface CopyOptions {
  readonly sourceRoot: string;
  readonly targetRoot: string;
  readonly rootId: string;
  readonly moveId: string;
  readonly workerScript: string;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: CopyProgress) => void;
  readonly operations?: CopyOperations;
}

interface Pending {
  readonly resolve: (response: ScanResponse) => void;
  readonly reject: (cause: Error) => void;
}

class ScanWorker {
  private readonly worker: Worker;
  private readonly pending = new Map<number, Pending>();
  private next = 0;
  private closed = false;

  constructor(script: string) {
    this.worker = new Worker(script);
    this.worker.on('message', (raw: unknown) => {
      const response = SCAN_RESPONSE.parse(raw);
      const waiting = this.pending.get(response.id);
      this.pending.delete(response.id);
      waiting?.resolve(response);
    });
    this.worker.on('error', (cause) => {
      this.fail(cause instanceof Error ? cause : new Error(String(cause)));
    });
    this.worker.on('exit', (code) => {
      if (!this.closed) {
        this.fail(new Error(`The move hash worker stopped with code ${String(code)}.`));
      }
    });
  }

  request(fields: Omit<ScanRequest, 'id'>): Promise<ScanResponse> {
    this.next += 1;
    const id = this.next;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...fields, id });
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    this.fail(new Error('The move hash worker was stopped.'));
    await this.worker.terminate();
  }

  private fail(cause: Error): void {
    for (const waiting of this.pending.values()) {
      waiting.reject(cause);
    }
    this.pending.clear();
  }
}

interface MutableTotals {
  files: number;
  bytes: number;
}

function emptyTotals(): Record<MoveArea, MutableTotals> {
  return {
    people: { files: 0, bytes: 0 },
    home: { files: 0, bytes: 0 },
    system: { files: 0, bytes: 0 },
    cache: { files: 0, bytes: 0 },
    backups: { files: 0, bytes: 0 },
  };
}

function seconds(milliseconds: number): number {
  return milliseconds / MS_PER_SECOND;
}

async function alreadyCopied(
  target: string,
  entry: WalkEntry & { kind: 'file' },
): Promise<boolean> {
  const info = await lstatIfPresent(target);
  return info?.isFile() === true && info.size === entry.size && info.mtimeMs === entry.mtimeMs;
}

class Copier {
  private readonly scanner: ScanWorker;

  constructor(
    private readonly options: CopyOptions,
    private readonly operations: CopyOperations,
  ) {
    this.scanner = new ScanWorker(options.workerScript);
  }

  close(): Promise<void> {
    return this.scanner.close();
  }

  async copy(entry: WalkEntry): Promise<ManifestEntry> {
    const base = {
      path: entry.relPath,
      area: entry.area,
      mode: entry.mode & PERMISSION_BITS,
      mtimeMs: entry.mtimeMs,
      prefixHits: 0,
      stable: true,
    };
    switch (entry.kind) {
      case 'file':
        return this.copyRegular(entry, base);
      case 'directory':
        await this.finishDirectory(entry);
        return { ...base, kind: 'directory', size: 0, sha256: null };
      case 'symlink':
        return {
          ...base,
          kind: 'symlink',
          size: 0,
          sha256: null,
          prefixHits: await this.link(entry),
        };
      case 'special':
        return { ...base, kind: 'special', size: 0, sha256: null };
    }
  }

  private source(relPath: string): string {
    return join(this.options.sourceRoot, relPath);
  }

  private target(relPath: string): string {
    return join(this.options.targetRoot, relPath);
  }

  private async copyRegular(
    entry: WalkEntry & { kind: 'file' },
    base: Omit<ManifestEntry, 'kind' | 'size' | 'sha256'>,
  ): Promise<ManifestEntry> {
    const target = this.target(entry.relPath);
    await mkdir(dirname(target), { recursive: true });
    if (!(await alreadyCopied(target, entry))) {
      await this.operations.copyFile(
        this.source(entry.relPath),
        target,
        constants.COPYFILE_FICLONE,
      );
      await chmod(target, base.mode);
      await utimes(target, seconds(entry.mtimeMs), seconds(entry.mtimeMs));
    }
    const response = await this.scanner.request({
      path: target,
      prefix: this.options.sourceRoot,
    });
    if (response.kind === 'failed') {
      throw new MoveCopyError(entry.relPath, response.code);
    }
    return {
      ...base,
      kind: 'file',
      size: entry.size,
      sha256: response.sha256,
      prefixHits: response.prefixHits,
      stable: await this.unchanged(entry),
    };
  }

  private async unchanged(entry: WalkEntry & { kind: 'file' }): Promise<boolean> {
    const after = await lstatIfPresent(this.source(entry.relPath));
    return after?.size === entry.size && after.mtimeMs === entry.mtimeMs;
  }

  private async finishDirectory(entry: WalkEntry): Promise<void> {
    const target = this.target(entry.relPath);
    await mkdir(target, { recursive: true });
    await chmod(target, entry.mode & PERMISSION_BITS);
    await utimes(target, seconds(entry.mtimeMs), seconds(entry.mtimeMs));
  }

  private async link(entry: WalkEntry): Promise<number> {
    const destination = await readlink(this.source(entry.relPath));
    const target = this.target(entry.relPath);
    await mkdir(dirname(target), { recursive: true });
    await rm(target, { force: true });
    await symlink(destination, target);
    await lutimes(target, seconds(entry.mtimeMs), seconds(entry.mtimeMs));
    return countPrefix(destination, this.options.sourceRoot);
  }
}

class Tally {
  files = 0;
  directories = 0;
  links = 0;
  special = 0;
  bytes = 0;
  unstable = 0;
  prefixHits = 0;
  readonly areas = emptyTotals();

  add(entry: ManifestEntry): void {
    this.prefixHits += entry.prefixHits;
    if (!entry.stable) {
      this.unstable += 1;
    }
    if (entry.kind === 'file') {
      this.files += 1;
      this.bytes += entry.size;
      this.areas[entry.area].files += 1;
      this.areas[entry.area].bytes += entry.size;
    } else if (entry.kind === 'directory') {
      this.directories += 1;
    } else if (entry.kind === 'symlink') {
      this.links += 1;
    } else {
      this.special += 1;
    }
  }

  summary(): CopySummary {
    return {
      files: this.files,
      directories: this.directories,
      links: this.links,
      special: this.special,
      bytes: this.bytes,
      unstable: this.unstable,
      prefixHits: this.prefixHits,
      areas: this.areas,
    };
  }
}

export async function copyHubEntries(options: CopyOptions): Promise<CopySummary> {
  await writeMoveMarker(options.targetRoot, { moveId: options.moveId, rootId: options.rootId });
  const manifest = await ManifestWriter.create(options.targetRoot);
  const copier = new Copier(options, options.operations ?? NODE_COPY_OPERATIONS);
  const tally = new Tally();
  try {
    for await (const entry of walkHubEntries(options.sourceRoot)) {
      options.signal?.throwIfAborted();
      const recorded = await copier.copy(entry);
      await manifest.append(recorded);
      tally.add(recorded);
      options.onProgress?.({
        files: tally.files,
        bytes: tally.bytes,
        area: entry.area,
        relPath: entry.relPath,
      });
    }
  } finally {
    await copier.close();
    await manifest.close();
  }
  return tally.summary();
}
