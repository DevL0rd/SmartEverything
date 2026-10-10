import { appendFile, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger } from '@smarteverything/logging';

export const PERF_SCOPE = 'app.perf';
export const PERF_FILE = 'perf-samples.jsonl';
export const PERF_ROTATED_FILE = 'perf-samples.jsonl.1';
export const PERF_MAX_BYTES = 20 * 1024 * 1024;

export interface PerfRecord {
  readonly at: string;
  readonly clientId: string;
  readonly client: string;
  readonly platform: string;
  readonly release: string;
  readonly screen: string | null;
  readonly message: string | null;
}

async function sizeOf(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return 0;
    }
    throw error;
  }
}

export class PerfSamples {
  private queue: Promise<void> = Promise.resolve();
  private readonly file: string;
  private readonly rotated: string;

  constructor(
    directory: string,
    private readonly log: Logger,
    private readonly maxBytes: number = PERF_MAX_BYTES,
  ) {
    this.file = join(directory, PERF_FILE);
    this.rotated = join(directory, PERF_ROTATED_FILE);
  }

  append(record: PerfRecord): void {
    const line = `${JSON.stringify(record)}\n`;
    this.queue = this.queue
      .then(() => this.write(line))
      .catch((error: unknown) => {
        this.log.warn('perf_samples.write_failed', { reason: String(error) });
      });
  }

  flushed(): Promise<void> {
    return this.queue;
  }

  private async write(line: string): Promise<void> {
    const size = await sizeOf(this.file);
    if (size > 0 && size + line.length > this.maxBytes) {
      await rename(this.file, this.rotated);
    }
    await appendFile(this.file, line, { mode: 0o600 });
  }
}
