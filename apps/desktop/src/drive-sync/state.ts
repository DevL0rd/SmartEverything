import type { DriveSyncError } from '@smarteverything/domain';
import { parseIgnore, type IgnoreMatcher } from '@smarteverything/domain/drive-sync';
import { messageOf, type Logger } from '@smarteverything/logging';
import type { DriveSyncDatabase } from './db/index.js';
import { isPlaceholder, type Placeholders, type Wants } from './select.js';
import type { SyncClientStateReport, SyncSocket } from './socket.js';
import type { SyncWaiting } from './service.js';

export interface SyncFailure {
  readonly relPath: string | null;
  readonly message: string;
}

export class IgnorePatternsError extends Error {
  constructor(readonly lines: readonly number[]) {
    super(`The skip patterns are not valid on line ${lines.join(', ')}`);
    this.name = 'IgnorePatternsError';
  }
}

export function ignoreMatcherOf(
  patterns: readonly string[],
  platform: NodeJS.Platform,
): IgnoreMatcher {
  const parsed = parseIgnore(patterns.join('\n'), platform === 'win32' || platform === 'darwin');
  if (!parsed.ok) throw new IgnorePatternsError(parsed.errors.map((error) => error.line));
  return parsed.matcher;
}

export class SyncErrors {
  readonly #byPath = new Map<string | null, DriveSyncError>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  failed(failure: SyncFailure): void {
    this.#byPath.set(failure.relPath, {
      relPath: failure.relPath,
      message: failure.message,
      at: this.now().toISOString(),
    });
  }

  resolved(relPath: string): void {
    this.#byPath.delete(relPath);
  }

  settled(): void {
    this.#byPath.delete(null);
  }

  list(): readonly DriveSyncError[] {
    return [...this.#byPath.values()];
  }
}

export interface StateReporterOptions {
  readonly placementId: string;
  readonly database: Pick<DriveSyncDatabase, 'files'>;
  readonly socket: Pick<SyncSocket, 'report'>;
  readonly placeholders: Placeholders;
  readonly wants: Wants;
  readonly waiting: () => SyncWaiting;
  readonly log: Logger;
}

export class StateReporter {
  readonly #errors = new SyncErrors();

  constructor(private readonly options: StateReporterOptions) {}

  failed(failure: SyncFailure): void {
    this.#errors.failed(failure);
    this.publish();
  }

  resolved(relPath: string): void {
    this.#errors.resolved(relPath);
    this.publish();
  }

  settled(): void {
    this.#errors.settled();
    this.publish();
  }

  report(): SyncClientStateReport {
    const { database, placementId, placeholders, wants, waiting } = this.options;
    const have = database.files
      .list(placementId)
      .filter(
        (record) => record.kind === 'file' && !isPlaceholder(record) && record.hubRev !== null,
      ).length;
    return {
      need: waiting().needBytes + placeholders.downloadBytes(wants),
      have,
      errors: this.#errors.list(),
    };
  }

  publish(): void {
    const { socket, placementId, log } = this.options;
    socket.report(placementId, this.report()).catch((cause: unknown) => {
      log.debug('drive_sync.engine.report_deferred', () => ({ error: messageOf(cause) }));
    });
  }
}
