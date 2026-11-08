import { appendFile, mkdir, rename, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Logger } from '@smarteverything/logging';
import { isMissing } from '../fs-util';
import { failureLine } from '@smarteverything/logging';

const PERF_MAX_BYTES = 20 * 1024 * 1024;

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
    if (isMissing(error)) {
      return 0;
    }
    throw error;
  }
}

export class PerfSamples {
  private queue: Promise<void> = Promise.resolve();
  private readonly rotated: string;

  constructor(
    private readonly file: string,
    private readonly log: Logger,
    private readonly maxBytes: number = PERF_MAX_BYTES,
  ) {
    this.rotated = `${file}.1`;
  }

  append(record: PerfRecord): void {
    const line = `${JSON.stringify(record)}\n`;
    this.queue = this.queue
      .then(() => this.write(line))
      .catch((error: unknown) => {
        this.log.warn('perf_samples.write_failed', { reason: failureLine(error) });
      });
  }

  flushed(): Promise<void> {
    return this.queue;
  }

  private async write(line: string): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
    const size = await sizeOf(this.file);
    if (size > 0 && size + line.length > this.maxBytes) {
      await rename(this.file, this.rotated);
    }
    await appendFile(this.file, line, { mode: 0o600 });
  }
}
