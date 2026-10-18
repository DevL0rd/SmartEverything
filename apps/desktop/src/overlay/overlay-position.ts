import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { FreePosition } from './overlay-placement.js';

const log = new Logger('desktop.overlay');

const FREE_POSITION = z.strictObject({
  cx: z.number().min(0).max(1),
  cy: z.number().min(0).max(1),
});

export interface PositionPort {
  load(): FreePosition | null;
  save(position: FreePosition | null): void;
}

function missing(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'ENOENT';
}

export function filePositionStore(file: string): PositionPort {
  return {
    load: (): FreePosition | null => {
      try {
        const parsed = FREE_POSITION.safeParse(JSON.parse(readFileSync(file, 'utf8')));
        return parsed.success ? parsed.data : null;
      } catch (cause) {
        if (!missing(cause)) {
          log.warn('overlay.position_unreadable', { file });
        }
        return null;
      }
    },
    save: (position): void => {
      if (position === null) {
        rmSync(file, { force: true });
        return;
      }
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(position));
    },
  };
}
