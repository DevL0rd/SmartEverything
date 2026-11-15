import { LIVE_PROTOCOL_MISMATCH } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { UnreadableAnswerError } from '../api/connection/client';
import { rawErrorText } from '../format/errors';
import type { SectionFailure, SyncProblem } from './state';
import type { EntityStore } from './entity-store';

const log = new Logger('app.live');

const TIMED_OUT: SyncProblem = {
  text: 'The server did not answer in time',
  remedy: 'server-settings',
};

function protocolMismatch(reason: string): SyncProblem {
  log.error('live.protocol_mismatch', new Error(`the server closed the live link: ${reason}`), {
    reason,
  });
  return {
    text: 'Your server speaks a newer live protocol than this app. Update the app.',
    remedy: 'update-app',
  };
}

function serverProblem(error: unknown): SyncProblem {
  return { text: rawErrorText(error), remedy: 'server-settings' };
}

function snapshotProblem(error: unknown): SyncProblem {
  return error instanceof UnreadableAnswerError
    ? {
        text: `This app cannot read what your server sends (${error.issues}). Update the app.`,
        remedy: 'update-app',
      }
    : serverProblem(error);
}

function closing(code: number, reason: string): SyncProblem | null {
  return code === LIVE_PROTOCOL_MISMATCH.code ? protocolMismatch(reason) : null;
}

export const PROBLEMS = {
  timedOut: TIMED_OUT,
  server: serverProblem,
  snapshot: snapshotProblem,
  closing,
} as const;

export class SectionFailures {
  private fromSnapshot: readonly SectionFailure[] = [];
  private readonly fromLive = new Map<string, SectionFailure>();

  constructor(private readonly store: EntityStore) {}

  has(section: string): boolean {
    return (
      this.fromLive.has(section) || this.fromSnapshot.some((failure) => failure.section === section)
    );
  }

  snapshot(failures: readonly SectionFailure[]): void {
    this.fromSnapshot = failures;
  }

  live(failures: readonly SectionFailure[]): void {
    failures.forEach((failure) => {
      if (!this.fromLive.has(failure.section)) this.fromLive.set(failure.section, failure);
    });
    this.store.setSync({ failed: this.all() });
  }

  readable<C extends { readonly table: string }>(changes: readonly C[]): readonly C[] {
    const readable = changes.filter((change) => !this.fromLive.has(`tables.${change.table}`));
    if (readable.length !== changes.length) {
      log.debug('live.failed_changes_skipped', { skipped: changes.length - readable.length });
    }
    return readable;
  }

  unappliedChange(table: string, reason: string, error: Error): void {
    log.error('live.change_unreadable', error, { table, reason });
    this.live([{ section: `tables.${table}`, reason }]);
  }

  unreadableChange(table: string | null, reason: string): void {
    if (table === null) {
      log.warn('live.notice_ignored', { reason });
      return;
    }
    const section = `tables.${table}`;
    if (this.has(section)) {
      log.debug('live.failed_change_skipped', { table });
      return;
    }
    log.error('live.table_failed', new Error(`${section}: ${reason}`), { table, reason });
    this.live([{ section, reason: `the server sent a change this app cannot read: ${reason}` }]);
  }

  unsupported(tables: readonly string[], reason: string): void {
    log.error('live.tables_unsupported', new Error(`unsupported tables: ${tables.join(', ')}`), {
      tables,
      reason,
    });
    this.live(
      tables.map((table) => ({
        section: `tables.${table}`,
        reason: `the server does not offer this table: ${reason}`,
      })),
    );
  }

  all(): readonly SectionFailure[] {
    const live = [...this.fromLive.values()].filter(
      (failure) => !this.fromSnapshot.some((known) => known.section === failure.section),
    );
    return [...this.fromSnapshot, ...live];
  }
}
