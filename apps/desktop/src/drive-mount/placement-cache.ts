import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DRIVE_PLACEMENT, type DrivePlacement } from '@smarteverything/domain';
import { messageOf, type Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { CachePort } from './placements.js';

const PLACEMENTS = z.array(DRIVE_PLACEMENT).readonly();

export class FilePlacementCache implements CachePort {
  constructor(
    private readonly file: string,
    private readonly log: Logger,
  ) {}

  all(): readonly DrivePlacement[] {
    let text: string;
    try {
      text = readFileSync(this.file, 'utf8');
    } catch (cause) {
      if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return [];
      throw cause;
    }
    const parsed = PLACEMENTS.safeParse(JSON.parse(text));
    if (!parsed.success) {
      this.log.warn('drive_mount.cache_rejected', { error: messageOf(parsed.error) });
      return [];
    }
    return parsed.data;
  }

  replaceAll(placements: readonly DrivePlacement[]): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const staged = `${this.file}.partial`;
    writeFileSync(staged, JSON.stringify(placements), { mode: 0o600 });
    renameSync(staged, this.file);
  }

  clear(): void {
    rmSync(this.file, { force: true });
  }
}
