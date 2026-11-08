import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  HUB_UPDATE_LEDGER,
  HUB_UPDATE_LEDGER_FILE,
  hubUpdateOutcome,
  type HubUpdateOrigin,
  type HubUpdateRelease,
} from '@smarteverything/domain';
import { isHubServiceFatal } from '../store/repositories/repair-fingerprint';
import type { StoredLogRecord } from '../store/repositories/runtime-log-types';
import type { HubLayout } from '../data-layout';
import type { ServerContext } from './context';

export function keptHubReleaseOrigin(
  record: StoredLogRecord,
  latest: Pick<HubUpdateRelease, 'runId' | 'origin' | 'phase' | 'finishedAt'> | null,
): HubUpdateOrigin | undefined {
  if (
    !isHubServiceFatal(record) ||
    record.hubBootRunId === undefined ||
    latest?.runId !== record.hubBootRunId ||
    hubUpdateOutcome(latest) !== 'updated' ||
    latest.finishedAt === null ||
    latest.finishedAt > record.at
  )
    return undefined;
  return latest.origin;
}

function readLatestRelease(layout: HubLayout, log: ServerContext['log']): HubUpdateRelease | null {
  try {
    const path = join(layout.system.updates.selfUpdate, HUB_UPDATE_LEDGER_FILE);
    const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return HUB_UPDATE_LEDGER.parse(raw).releases.at(-1) ?? null;
  } catch (cause) {
    if (!(cause instanceof Error && 'code' in cause && cause.code === 'ENOENT'))
      log.error('repair.release_receipt_unreadable', cause);
    return null;
  }
}

function canReceiveHubRelease(store: ServerContext['store'], origin: HubUpdateOrigin): boolean {
  const chat = store.aiChats.find(origin.chatId);
  return (
    chat?.kind === 'chat' &&
    chat.profile_id === origin.profileId &&
    chat.archived_at === null &&
    chat.deletion_state === null &&
    store.personAccess.find(origin.profileId)?.role === 'owner'
  );
}

export function hubReleaseRecipient(
  context: Pick<ServerContext, 'store' | 'log'>,
  layout: HubLayout,
  record: StoredLogRecord,
): HubUpdateOrigin | undefined {
  if (record.hubBootRunId === undefined || !isHubServiceFatal(record)) return undefined;
  const origin = keptHubReleaseOrigin(record, readLatestRelease(layout, context.log));
  if (origin === undefined) return undefined;
  return canReceiveHubRelease(context.store, origin) ? origin : undefined;
}
