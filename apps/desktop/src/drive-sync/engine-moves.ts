import { mkdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { SyncIndexEntry } from '@smarteverything/domain/drive-sync';
import type { Logger } from '@smarteverything/logging';
import type { DriveSyncDatabase } from './db/index.js';
import { diskPathFor } from './scan.js';

export interface HubMovesOptions {
  readonly placementId: string;
  readonly rootPath: string;
  readonly platform: NodeJS.Platform;
  readonly database: Pick<DriveSyncDatabase, 'files'>;
  readonly log: Logger;
}

function isMissing(cause: unknown): boolean {
  return typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'ENOENT';
}

function depthOf(entry: SyncIndexEntry): number {
  return entry.relPath.split('/').length;
}

export class HubMoves {
  readonly #options: HubMovesOptions;
  readonly #paths = new Map<string, string>();

  constructor(options: HubMovesOptions) {
    this.#options = options;
  }

  async apply(entries: readonly SyncIndexEntry[]): Promise<void> {
    const live = entries.filter((entry) => !entry.deleted);
    for (const entry of live.sort((first, second) => depthOf(first) - depthOf(second))) {
      const from = this.#paths.get(entry.itemId);
      if (from !== undefined && from !== entry.relPath) await this.#move(from, entry.relPath);
    }
    for (const entry of entries) {
      if (entry.deleted) this.#paths.delete(entry.itemId);
      else this.#paths.set(entry.itemId, entry.relPath);
    }
  }

  #disk(relPath: string): string {
    const { rootPath, platform } = this.#options;
    return diskPathFor(platform, join(rootPath, ...relPath.split('/')));
  }

  async #move(from: string, to: string): Promise<void> {
    const { database, placementId, log } = this.#options;
    if ((database.files.get(placementId, from)?.hubRev ?? null) === null) return;
    if (database.files.get(placementId, to) !== undefined) return;
    await mkdir(dirname(this.#disk(to)), { recursive: true });
    try {
      await rename(this.#disk(from), this.#disk(to));
    } catch (cause) {
      if (isMissing(cause)) return;
      throw cause;
    }
    database.files.rename(placementId, from, to);
    log.info('drive_sync.engine.hub_move', { placementId, from, to });
  }
}
