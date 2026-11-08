import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Logger } from '@smarteverything/logging';
import type { DriveSyncDatabase, FileInput, FileRecord } from './db/index.js';
import { isHashedFile, pushIntentOf, type PushIntent } from './push-intents.js';
import type { PushConflict } from './push.js';
import { diskPathFor } from './scan.js';
import { diskStateOf } from './transfer.js';

export type ConflictOutcome =
  'kept_copy' | 'hub_won' | 'repushed' | 'restored' | 'already_gone' | 'unresolved';

export interface ConflictResult {
  readonly kind: PushConflict['kind'];
  readonly relPath: string;
  readonly reason: PushConflict['reason'];
  readonly outcome: ConflictOutcome;
  readonly copyPath: string | null;
}

export type ConflictDatabase = Pick<DriveSyncDatabase, 'files' | 'transaction'>;

export interface ConflictOptions {
  readonly rootId: string;
  readonly rootPath: string;
  readonly platform: NodeJS.Platform;
  readonly database: ConflictDatabase;
  readonly reindex: () => void;
  readonly submit: (intents: readonly PushIntent[]) => Promise<void>;
  readonly log: Logger;
}

function isMissing(cause: unknown): boolean {
  return typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === 'ENOENT';
}

function isUnder(relPath: string, folder: string): boolean {
  return relPath === folder || relPath.startsWith(`${folder}/`);
}

function inputOf(record: FileRecord, relPath: string, hubRev: number | null): FileInput {
  return {
    rootId: record.rootId,
    relPath,
    kind: record.kind,
    bytes: record.bytes,
    mtimeNs: record.mtimeNs,
    mode: record.mode,
    hubRev,
    localHashState: record.localHashState,
    blockSize: record.blockSize,
    blocks: record.blocks,
  };
}

export class ConflictResolver {
  readonly #options: ConflictOptions;

  constructor(options: ConflictOptions) {
    this.#options = options;
  }

  async resolve(conflict: PushConflict): Promise<ConflictResult> {
    const outcome = await this.#outcomeOf(conflict);
    this.#options.log.info('drive_sync.conflict.applied', {
      rootId: this.#options.rootId,
      kind: conflict.kind,
      relPath: conflict.relPath,
      reason: conflict.reason,
      outcome,
    });
    return {
      kind: conflict.kind,
      relPath: conflict.relPath,
      reason: conflict.reason,
      outcome,
      copyPath: conflict.conflictPath,
    };
  }

  #outcomeOf(conflict: PushConflict): Promise<ConflictOutcome> {
    if (conflict.kind === 'push') return this.#push(conflict);
    if (conflict.kind === 'move') return this.#move(conflict.relPath);
    return Promise.resolve(this.#tombstone(conflict));
  }

  #disk(relPath: string): string {
    const { rootPath, platform } = this.#options;
    return diskPathFor(platform, join(rootPath, ...relPath.split('/')));
  }

  async #push(conflict: PushConflict): Promise<ConflictOutcome> {
    const { relPath, conflictPath, reason } = conflict;
    if (conflictPath !== null) {
      await this.#keepCopy(relPath, conflictPath);
      this.#options.reindex();
      return 'kept_copy';
    }
    if (reason === 'stale') {
      await this.#dropLocal(relPath);
      this.#options.reindex();
      return 'hub_won';
    }
    if (reason === 'missing') {
      await this.#repush([relPath]);
      return 'repushed';
    }
    return 'unresolved';
  }

  async #keepCopy(relPath: string, copyPath: string): Promise<void> {
    const { database, rootId } = this.#options;
    const record = database.files.get(rootId, relPath);
    if (record === undefined) return;
    const present = database.files.get(rootId, copyPath);
    if (present !== undefined && present.hubRev !== null) {
      await rm(this.#disk(relPath), { force: true });
      database.files.remove(rootId, relPath);
      return;
    }
    const target = this.#disk(copyPath);
    await mkdir(dirname(target), { recursive: true });
    try {
      await rename(this.#disk(relPath), target);
    } catch (cause) {
      if (!isMissing(cause)) throw cause;
      database.files.remove(rootId, relPath);
      return;
    }
    database.transaction(() => {
      database.files.remove(rootId, relPath);
      database.files.upsert(inputOf(record, copyPath, null));
    });
  }

  async #dropLocal(relPath: string): Promise<void> {
    const { database, rootId } = this.#options;
    const record = database.files.get(rootId, relPath);
    const disk = this.#disk(relPath);
    if (record === undefined || (await diskStateOf(disk, record)) === 'changed') return;
    await rm(disk, { force: true });
    database.files.remove(rootId, relPath);
  }

  async #move(relPath: string): Promise<ConflictOutcome> {
    const { database, rootId } = this.#options;
    const moved = database.files.list(rootId).filter((record) => isUnder(record.relPath, relPath));
    await this.#repush(moved.map((record) => record.relPath));
    this.#options.reindex();
    return 'repushed';
  }

  #tombstone(conflict: PushConflict): ConflictOutcome {
    if (conflict.reason !== 'stale') return 'already_gone';
    this.#options.reindex();
    return 'restored';
  }

  async #repush(relPaths: readonly string[]): Promise<void> {
    const { database, rootId } = this.#options;
    database.transaction(() => {
      for (const relPath of relPaths) {
        const record = database.files.get(rootId, relPath);
        if (record !== undefined) database.files.upsert(inputOf(record, relPath, null));
      }
    });
    const intents = relPaths.flatMap((relPath) => {
      const record = database.files.get(rootId, relPath);
      return isHashedFile(record) ? pushIntentOf(record, relPath) : [];
    });
    await this.#options.submit(intents);
  }
}
