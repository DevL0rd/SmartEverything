import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { mkdir, rename, stat, statfs } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable, Writable } from 'node:stream';
import { ApiError, type HomeMapScan, type HomeMapScanFormat } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { scanFileNames } from './scan-reach';
import { createScanValidator, type ScanValidator } from './scan-validate';

export class ScanNoSpaceError extends ApiError {
  override readonly status = 507;

  constructor() {
    super('payload_too_large', 'Not enough space on the hub', 'insufficient_storage');
  }
}

export interface ScanStorePorts {
  readonly root: string;
  readonly freeBytes: (directory: string) => Promise<number>;
  readonly openWrite: (path: string) => Writable;
  readonly newId: () => string;
  readonly log: Logger;
}

export interface ScanUpload {
  readonly declared: number;
  readonly format: HomeMapScanFormat;
}

export interface ReceivedScan {
  readonly path: string;
  readonly hash: string;
  readonly bytes: number;
  readonly points: number;
}

export interface ScanFileRef {
  readonly hash: string;
  readonly format: HomeMapScanFormat;
}

export interface ScanSource {
  readonly size: number;
  readonly stream: (range?: { readonly start: number; readonly end: number }) => Readable;
}

const TEMP_DIRECTORY = 'tmp';

const CANCELLED_CODES = new Set(['ERR_STREAM_PREMATURE_CLOSE', 'ECONNRESET']);

const NOTHING_HELD: ReadonlySet<string> = new Set();

export function nodeScanPorts(root: string, log: Logger): ScanStorePorts {
  return {
    root,
    freeBytes: async (directory): Promise<number> => {
      const disk = await statfs(directory);
      return disk.bavail * disk.bsize;
    },
    openWrite: (path): Writable => createWriteStream(path, { flags: 'wx' }),
    newId: randomUUID,
    log,
  };
}

const closed = (stream: Writable): Promise<void> =>
  stream.closed
    ? Promise.resolve()
    : new Promise((resolve) => {
        stream.once('close', resolve);
      });

const refused = (problem: string): ApiError =>
  new ApiError('invalid_request', `The scan file is refused: ${problem}.`);

const codeOf = (error: unknown): unknown =>
  error instanceof Error && 'code' in error ? error.code : undefined;

class ScanIntake {
  private received = 0;
  private readonly hash = createHash('sha256');
  private points = 0;
  private digest = '';

  constructor(
    private readonly declared: number,
    private readonly validator: ScanValidator,
  ) {}

  async *run(chunks: AsyncIterable<Buffer>): AsyncGenerator<Buffer> {
    try {
      for await (const chunk of chunks) {
        this.received += chunk.byteLength;
        if (this.received > this.declared) {
          throw refused(`more bytes arrived than the ${String(this.declared)} declared`);
        }
        this.hash.update(chunk);
        const problem = await this.validator.feed(chunk);
        if (problem !== null) throw refused(problem);
        yield chunk;
      }
      await this.close();
    } finally {
      this.validator.cancel();
    }
  }

  result(path: string): ReceivedScan {
    return { path, hash: this.digest, bytes: this.received, points: this.points };
  }

  private async close(): Promise<void> {
    if (this.received !== this.declared) {
      throw refused(
        `${String(this.received)} bytes arrived but ${String(this.declared)} were declared`,
      );
    }
    const verdict = await this.validator.finish();
    if (!verdict.ok) throw refused(verdict.problem);
    this.points = verdict.points;
    this.digest = this.hash.digest('hex');
  }
}

export class ScanStore {
  private tail: Promise<unknown> = Promise.resolve();
  private readonly pending = new Set<string>();

  constructor(private readonly ports: ScanStorePorts) {}

  exclusive<T>(task: () => T | Promise<T>): Promise<T> {
    const result = this.tail.then(task);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async receive(source: Readable, upload: ScanUpload): Promise<ReceivedScan> {
    await this.ensureSpace(upload.declared);
    const path = this.tempPath();
    const intake = new ScanIntake(upload.declared, createScanValidator(upload.format));
    const sink = this.ports.openWrite(path);
    try {
      await pipeline(source, (chunks: AsyncIterable<Buffer>) => intake.run(chunks), sink);
    } catch (error) {
      await closed(sink);
      this.discardPath(path);
      throw this.failure(error);
    }
    return intake.result(path);
  }

  async commit(received: ReceivedScan, mapId: string, format: HomeMapScanFormat): Promise<void> {
    const target = this.pathOf(mapId, { hash: received.hash, format });
    this.pending.add(target);
    try {
      await mkdir(this.directoryOf(mapId), { recursive: true });
      await rename(received.path, target);
    } catch (error) {
      this.pending.delete(target);
      this.discardPath(received.path);
      throw error;
    }
  }

  release(mapId: string, file: ScanFileRef): void {
    this.pending.delete(this.pathOf(mapId, file));
  }

  discard(received: ReceivedScan): void {
    this.discardPath(received.path);
  }

  pathOf(mapId: string, file: ScanFileRef): string {
    return join(this.directoryOf(mapId), `${file.hash}.${file.format}`);
  }

  async source(mapId: string, file: ScanFileRef): Promise<ScanSource | null> {
    const path = this.pathOf(mapId, file);
    try {
      const { size } = await stat(path);
      return { size, stream: (range) => createReadStream(path, range) };
    } catch (error) {
      if (codeOf(error) === 'ENOENT') return null;
      throw error;
    }
  }

  reconcile(mapId: string, scan: HomeMapScan | undefined, held = NOTHING_HELD): void {
    const directory = this.directoryOf(mapId);
    const keep = new Set(held);
    if (scan !== undefined) for (const name of scanFileNames(scan)) keep.add(name);
    if (keep.size === 0 && !this.hasPending(directory)) {
      this.remove(mapId, directory, { recursive: true });
      return;
    }
    for (const name of this.namesIn(mapId, directory)) {
      const path = join(directory, name);
      if (!keep.has(name) && !this.pending.has(path)) this.remove(mapId, path, {});
    }
  }

  removeAll(mapId: string): void {
    rmSync(this.directoryOf(mapId), { recursive: true, force: true });
  }

  sweepTemp(): void {
    rmSync(join(this.ports.root, TEMP_DIRECTORY), { recursive: true, force: true });
  }

  private hasPending(directory: string): boolean {
    return [...this.pending].some((path) => path.startsWith(`${directory}${sep}`));
  }

  private directoryOf(mapId: string): string {
    return join(this.ports.root, Buffer.from(mapId).toString('base64url'));
  }

  private tempPath(): string {
    const directory = join(this.ports.root, TEMP_DIRECTORY);
    mkdirSync(directory, { recursive: true });
    return join(directory, `${this.ports.newId()}.part`);
  }

  private async ensureSpace(declared: number): Promise<void> {
    await mkdir(this.ports.root, { recursive: true });
    const free = await this.ports.freeBytes(this.ports.root);
    if (free >= declared) return;
    this.ports.log.warn('home_map.scan_no_space', { declared, free });
    throw new ScanNoSpaceError();
  }

  private discardPath(path: string): void {
    try {
      rmSync(path, { force: true });
    } catch (error) {
      this.ports.log.error('home_map.scan_temp_delete_failed', { error: String(error) });
    }
  }

  private failure(error: unknown): unknown {
    if (error instanceof ApiError) return error;
    const code = codeOf(error);
    if (code === 'ENOSPC') {
      this.ports.log.warn('home_map.scan_no_space', { while: 'writing' });
      return new ScanNoSpaceError();
    }
    if (typeof code === 'string' && CANCELLED_CODES.has(code)) {
      this.ports.log.info('home_map.scan_upload_cancelled', { code });
      return new ApiError('invalid_request', 'The upload ended before all of the file arrived.');
    }
    return error;
  }

  private namesIn(mapId: string, directory: string): string[] {
    try {
      return readdirSync(directory);
    } catch (error) {
      if (codeOf(error) !== 'ENOENT') {
        this.ports.log.error('home_map.scan_list_failed', { mapId, error: String(error) });
      }
      return [];
    }
  }

  private remove(mapId: string, path: string, options: { readonly recursive?: boolean }): void {
    try {
      rmSync(path, { force: true, ...options });
    } catch (error) {
      this.ports.log.error('home_map.scan_file_delete_failed', { mapId, error: String(error) });
    }
  }
}
