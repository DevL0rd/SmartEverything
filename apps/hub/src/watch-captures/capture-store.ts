import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  WATCH_CAPTURE_ENTRY,
  type WatchCaptureEntry,
  type WatchCaptureFile,
  type WatchCaptureSummary,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';

export interface CaptureSource {
  readonly deviceId: string;
  readonly clientId: string;
}

export interface CaptureSaved {
  readonly stored: readonly string[];
  readonly duplicates: readonly string[];
}

const RAW = '.bin';
const META = '.json';

function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    (failure: unknown) => {
      if (failure instanceof Error && 'code' in failure && failure.code === 'ENOENT') return false;
      throw failure;
    },
  );
}

export class WatchCaptureStore {
  constructor(
    private readonly root: string,
    private readonly now: () => Date,
    private readonly log: Logger,
  ) {}

  async save(source: CaptureSource, files: readonly WatchCaptureFile[]): Promise<CaptureSaved> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const stored: string[] = [];
    const duplicates: string[] = [];
    for (const file of files) {
      const bytes = Buffer.from(file.bytes, 'base64');
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      if (await exists(join(this.root, `${sha256}${RAW}`))) {
        duplicates.push(sha256);
        continue;
      }
      await this.write(sha256, bytes, this.entryOf(sha256, source, file, bytes.length));
      stored.push(sha256);
    }
    this.log.info('captures.saved', {
      device: source.deviceId,
      by: source.clientId,
      stored: stored.length,
      duplicates: duplicates.length,
    });
    return { stored, duplicates };
  }

  async summary(): Promise<WatchCaptureSummary> {
    const entries = await this.entries();
    return {
      files: entries.length,
      bytes: entries.reduce((total, entry) => total + entry.size, 0),
      entries,
    };
  }

  async clear(by: string): Promise<void> {
    const before = await this.entries();
    await rm(this.root, { recursive: true, force: true });
    this.log.info('captures.cleared', { by, files: before.length });
  }

  private async entries(): Promise<WatchCaptureEntry[]> {
    if (!(await exists(this.root))) return [];
    const names = (await readdir(this.root)).filter((name) => name.endsWith(META));
    const entries = await Promise.all(
      names.map(async (name) =>
        WATCH_CAPTURE_ENTRY.parse(JSON.parse(await readFile(join(this.root, name), 'utf8'))),
      ),
    );
    return entries.sort((a, b) => a.watchTime.localeCompare(b.watchTime));
  }

  private entryOf(
    sha256: string,
    source: CaptureSource,
    file: WatchCaptureFile,
    size: number,
  ): WatchCaptureEntry {
    const { bytes: _bytes, ...described } = file;
    return {
      sha256,
      ...source,
      ...described,
      size,
      capturedAt: this.now().toISOString(),
    };
  }

  private async write(sha256: string, bytes: Buffer, entry: WatchCaptureEntry): Promise<void> {
    await writeFile(join(this.root, `${sha256}${RAW}`), bytes, { mode: 0o600 });
    await writeFile(join(this.root, `${sha256}${META}`), JSON.stringify(entry, null, 2), {
      mode: 0o600,
    });
  }
}
