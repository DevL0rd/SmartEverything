import { messageOf, type Logger } from '@smarteverything/logging';
import type { Destination, Placed } from './destination';
import { GoogleApiError, GoogleImportError } from './errors';
import type { GoogleHttp } from './http';
import type { ImportCounts, ImportLedger, ImportRecord } from './ledger';
import type { ImportSource } from './scopes';

export interface RunContext {
  readonly importId: string;
  readonly http: GoogleHttp;
  readonly destination: Destination;
  readonly ledger: ImportLedger;
  readonly signal: AbortSignal;
  readonly log: Logger;
  readonly changed: (record: ImportRecord) => void;
}

export type Delta = Partial<Record<keyof ImportCounts, number>>;

export function tally(context: RunContext, source: ImportSource, delta: Delta): void {
  const record = context.ledger.find(context.importId);
  if (record === undefined) {
    return;
  }
  const before = record[source];
  const next: ImportCounts = {
    listed: before.listed + (delta.listed ?? 0),
    copied: before.copied + (delta.copied ?? 0),
    duplicates: before.duplicates + (delta.duplicates ?? 0),
    skipped: before.skipped + (delta.skipped ?? 0),
    failed: before.failed + (delta.failed ?? 0),
    bytes: before.bytes + (delta.bytes ?? 0),
  };
  context.changed(
    context.ledger.update(
      context.importId,
      source === 'drive' ? { drive: next } : { photos: next },
    ),
  );
}

export function stopsRun(cause: unknown, signal: AbortSignal): boolean {
  if (signal.aborted || cause instanceof GoogleImportError) {
    return true;
  }
  return cause instanceof GoogleApiError && (cause.status === 429 || cause.status >= 500);
}

export type Fetched = Placed | { readonly kind: 'skipped'; readonly reason: string };

export async function transferItem(
  context: RunContext,
  source: ImportSource,
  remoteId: string,
  fetch: () => Promise<Fetched>,
): Promise<void> {
  if (context.ledger.isDone(context.importId, source, remoteId)) {
    return;
  }
  tally(context, source, { listed: 1 });
  try {
    const placed = await fetch();
    if (placed.kind === 'skipped') {
      context.log.info('google_import.skipped', { source, reason: placed.reason });
      tally(context, source, { skipped: 1 });
    } else if (placed.kind === 'duplicate') {
      tally(context, source, { duplicates: 1 });
    } else {
      tally(context, source, { copied: 1, bytes: placed.bytes });
    }
    context.ledger.markDone(context.importId, source, remoteId);
  } catch (cause) {
    if (stopsRun(cause, context.signal)) {
      throw cause;
    }
    context.log.warn('google_import.item_failed', { source, error: messageOf(cause) });
    tally(context, source, { failed: 1 });
  }
}
