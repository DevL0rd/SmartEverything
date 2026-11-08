import type { Logger } from '@smarteverything/logging';
import type { GoogleClient } from '../../google/oauth';
import type { FetchLike } from '../../plugins/builtin/fetch-like';
import { Consents, scopesOf, type ConsentStarted } from './consent';
import { Destination, type DestinationEnv } from './destination';
import { runDrive } from './drive-run';
import { GoogleApiError, GoogleImportError, type ImportFailure } from './errors';
import { GoogleHttp } from './http';
import {
  NO_COUNTS,
  type ImportLedger,
  type ImportRecord,
  type ImportSelection,
  type ImportState,
} from './ledger';
import type { PickWait, Wait } from './picker-source';
import { runPhotos } from './photos-run';
import { IMPORT_LIMITS, type ImportLimit } from './scopes';
import { TokenSession } from './token-session';
import type { RunContext } from './transfer';

export interface ImportProgress {
  readonly record: ImportRecord;
  readonly pickerUri: string | null;
  readonly limits: readonly ImportLimit[];
}

export interface GoogleImportDeps {
  readonly ledger: ImportLedger;
  readonly destination: DestinationEnv;
  readonly fetch: FetchLike;
  readonly client: () => GoogleClient | null;
  readonly newId: () => string;
  readonly now: () => Date;
  readonly wait: Wait;
  readonly report: (progress: ImportProgress) => void;
  readonly log: Logger;
}

interface Active {
  readonly profileId: string;
  readonly controller: AbortController;
  readonly session: TokenSession | null;
  pickerUri: string | null;
  cancelled: boolean;
  done: Promise<void> | null;
}

interface Outcome {
  readonly state: ImportState;
  readonly failure: ImportFailure | null;
}

function outcomeOf(cause: unknown): Outcome {
  if (cause instanceof GoogleImportError) {
    const resumable =
      cause.failure === 'consent_expired' ||
      cause.failure === 'google_unreachable' ||
      cause.failure === 'storage_full';
    return { state: resumable ? 'interrupted' : 'failed', failure: cause.failure };
  }
  if (cause instanceof GoogleApiError && (cause.status === 429 || cause.status >= 500)) {
    return { state: 'interrupted', failure: 'google_unreachable' };
  }
  return { state: 'failed', failure: 'google_refused' };
}

export class GoogleImportService {
  private readonly consents: Consents;
  private readonly active = new Map<string, Active>();

  constructor(private readonly deps: GoogleImportDeps) {
    this.consents = new Consents(deps.fetch, deps.client);
  }

  begin(input: {
    readonly profileId: string;
    readonly selection: ImportSelection;
    readonly redirectUri: string;
  }): ConsentStarted & { readonly importId: string } {
    if (scopesOf(input.selection).length === 0) {
      throw new GoogleImportError('nothing_selected');
    }
    this.assertIdle(input.profileId);
    if (this.deps.destination.rootOf(input.profileId) === null) {
      throw new GoogleImportError('no_library_folder');
    }
    const importId = this.deps.newId();
    const record: ImportRecord = {
      id: importId,
      profileId: input.profileId,
      selection: input.selection,
      state: 'awaiting_consent',
      failure: null,
      driveCursor: null,
      drive: NO_COUNTS,
      photos: NO_COUNTS,
      startedAt: this.deps.now().toISOString(),
      finishedAt: null,
    };
    const started = this.consents.begin({ importId, ...input });
    this.deps.ledger.insert(record);
    this.active.set(importId, this.idle(input.profileId));
    this.announce(record);
    return { importId, ...started };
  }

  resume(input: {
    readonly profileId: string;
    readonly importId: string;
    readonly redirectUri: string;
  }): ConsentStarted {
    const record = this.owned(input.profileId, input.importId);
    if (record.state !== 'interrupted') {
      throw new GoogleImportError('not_resumable');
    }
    this.assertIdle(input.profileId);
    const started = this.consents.begin({ ...input, selection: record.selection });
    this.active.set(record.id, this.idle(input.profileId));
    this.announce(this.deps.ledger.update(record.id, { state: 'awaiting_consent', failure: null }));
    return started;
  }

  async complete(input: {
    readonly profileId: string;
    readonly state: string;
    readonly code: string;
    readonly redirectUri: string;
  }): Promise<ImportRecord> {
    const { importId, grant } = await this.consents.complete(input);
    const record = this.owned(input.profileId, importId);
    const session = new TokenSession(
      {
        fetch: this.deps.fetch,
        client: this.consents.require(),
        now: this.deps.now,
        log: this.deps.log,
      },
      grant,
    );
    if (!scopesOf(record.selection).every((scope) => grant.scopes.includes(scope))) {
      await session.discard();
      this.active.delete(record.id);
      this.finish(record.id, { state: 'failed', failure: 'consent_refused' });
      throw new GoogleImportError('consent_refused');
    }
    const running = this.deps.ledger.update(record.id, { state: 'running' });
    const active: Active = { ...this.idle(input.profileId), session };
    this.active.set(record.id, active);
    this.announce(running);
    active.done = this.run(running, active, session);
    return running;
  }

  async cancel(profileId: string, importId: string): Promise<ImportRecord> {
    const record = this.owned(profileId, importId);
    const active = this.active.get(importId);
    this.consents.drop(importId);
    if (active === undefined) {
      return record;
    }
    active.cancelled = true;
    active.controller.abort();
    await active.done;
    if (this.deps.ledger.find(importId)?.state === 'finished') {
      return this.owned(profileId, importId);
    }
    this.active.delete(importId);
    return this.finish(importId, { state: 'cancelled', failure: null });
  }

  status(profileId: string): ImportProgress | null {
    const record = this.deps.ledger.latestOf(profileId);
    return record === undefined ? null : this.progress(record);
  }

  recoverAtStart(): void {
    for (const record of this.deps.ledger.unfinished()) {
      this.deps.log.warn('google_import.interrupted_by_restart', { importId: record.id });
      this.announce(this.deps.ledger.update(record.id, { state: 'interrupted', failure: null }));
    }
  }

  settled(importId: string): Promise<void> {
    return this.active.get(importId)?.done ?? Promise.resolve();
  }

  holdsToken(importId: string): boolean {
    return this.active.get(importId)?.session?.isHeld() ?? false;
  }

  private idle(profileId: string): Active {
    return {
      profileId,
      controller: new AbortController(),
      session: null,
      pickerUri: null,
      cancelled: false,
      done: null,
    };
  }

  private assertIdle(profileId: string): void {
    for (const active of this.active.values()) {
      if (active.profileId === profileId) {
        throw new GoogleImportError('already_running');
      }
    }
  }

  private owned(profileId: string, importId: string): ImportRecord {
    const record = this.deps.ledger.find(importId);
    if (record?.profileId !== profileId) {
      throw new GoogleImportError('not_found');
    }
    return record;
  }

  private progress(record: ImportRecord): ImportProgress {
    return {
      record,
      pickerUri: this.active.get(record.id)?.pickerUri ?? null,
      limits: record.selection.photos ? IMPORT_LIMITS : [],
    };
  }

  private announce(record: ImportRecord): void {
    this.deps.report(this.progress(record));
  }

  private finish(importId: string, outcome: Outcome): ImportRecord {
    const record = this.deps.ledger.update(importId, {
      ...outcome,
      finishedAt: this.deps.now().toISOString(),
    });
    this.consents.drop(importId);
    this.announce(record);
    return record;
  }

  private async run(record: ImportRecord, active: Active, session: TokenSession): Promise<void> {
    const { signal } = active.controller;
    try {
      const destination = new Destination(this.deps.destination, record.profileId);
      const context: RunContext = {
        importId: record.id,
        http: new GoogleHttp(this.deps.fetch, session, signal),
        destination,
        ledger: this.deps.ledger,
        signal,
        log: this.deps.log,
        changed: (changed) => {
          this.announce(changed);
        },
      };
      await this.phases(record, context, active);
      if (!active.cancelled) {
        this.finish(record.id, { state: 'finished', failure: null });
      }
    } catch (cause) {
      if (!active.cancelled) {
        this.deps.log.error('google_import.stopped', cause, { importId: record.id });
        this.finish(record.id, outcomeOf(cause));
      }
    } finally {
      await session.discard();
      this.active.delete(record.id);
    }
  }

  private pickerOpened(record: ImportRecord, pickerUri: string): void {
    const active = this.active.get(record.id);
    if (active !== undefined) {
      active.pickerUri = pickerUri;
    }
    this.announce(this.deps.ledger.find(record.id) ?? record);
  }

  private async phases(record: ImportRecord, context: RunContext, active: Active): Promise<void> {
    const pick: PickWait = {
      wait: this.deps.wait,
      signal: active.controller.signal,
      announce: (session) => {
        this.pickerOpened(record, session.pickerUri);
      },
    };
    const work = [
      ...(record.selection.drive ? [runDrive(context, record.driveCursor)] : []),
      ...(record.selection.photos ? [runPhotos(context, pick)] : []),
    ];
    const causes: unknown[] = [];
    await Promise.all(
      work.map((phase) =>
        phase.catch((cause: unknown) => {
          causes.push(cause);
          active.controller.abort();
        }),
      ),
    );
    if (causes.length > 0) {
      throw causes[0];
    }
  }
}
