import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DrivePlacement } from '@smarteverything/domain';
import { z } from 'zod';
import { mountedIds } from './mount-state.js';

const OUTCOME = z.strictObject({ outcome: z.enum(['mounted', 'dismissed']) });

export const FIRST_RUN_FOLDER = 'SmartEverything';

export interface FirstRunOptions {
  readonly file: string;
  readonly home: string;
  readonly mountable: boolean;
}

export class FirstRun {
  private settled: boolean | null = null;

  constructor(private readonly options: FirstRunOptions) {}

  get defaultParent(): string {
    return join(this.options.home, FIRST_RUN_FOLDER);
  }

  async pending(known: readonly DrivePlacement[]): Promise<boolean> {
    if (!this.options.mountable || mountedIds(known).size > 0) return false;
    this.settled ??= await this.read();
    return !this.settled;
  }

  async settle(outcome: 'mounted' | 'dismissed'): Promise<void> {
    await writeFile(this.options.file, JSON.stringify(OUTCOME.parse({ outcome })), { mode: 0o600 });
    this.settled = true;
  }

  private async read(): Promise<boolean> {
    try {
      OUTCOME.parse(JSON.parse(await readFile(this.options.file, 'utf8')));
      return true;
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return false;
      throw cause;
    }
  }
}
