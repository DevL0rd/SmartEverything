import {
  repairEventId,
  repairEvidenceOf,
  retainedLogOf,
  type RepairRequest,
  type RepairDispatch,
} from '../assistant/repair-dispatch';
import { REPAIR_CHAT_SOURCE } from '../assistant/chat-directory';
import { withExecutionAuthority } from '../assistant/turn-authority';
import type { RuntimeLogRow } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import type { HubLayout } from '../data-layout';
import type { LogFailure, StoredLogRecord } from '../store/repositories/runtime-log-types';
import type { ServerContext } from './context';
import { repairComponent } from '../store/repositories/repair-fingerprint';
import { readAiRepairState } from './handlers/ai-repair';

type RepairContext = Pick<ServerContext, 'store' | 'logs' | 'log'> & {
  readonly assistant: { readonly repair: Pick<RepairDispatch, 'admit'> };
};

async function profileOf(
  context: RepairContext,
  record: StoredLogRecord,
): Promise<string | undefined> {
  const owners = await context.store.host.call('personAccess', 'ownerIds');
  if (record.runtime === 'app' && record.clientId !== null)
    return owners.find((owner) => owner === record.clientId);
  if (record.runtime === 'desktop' && record.deviceId !== null) {
    const client = await context.store.host.call('clients', 'find', record.deviceId);
    return client?.profile_id !== null && client?.profile_id !== undefined
      ? owners.find((owner) => owner === client.profile_id)
      : undefined;
  }
  return owners.length === 1 ? owners[0] : undefined;
}

export function repairLogOrigin(
  record: Pick<StoredLogRecord, 'source' | 'scope' | 'event' | 'payload' | 'repairOrigin'>,
): RepairRequest['origin'] {
  if (
    record.source === 'hub:service' &&
    record.scope === 'hub.harness' &&
    record.event === 'session.failed' &&
    record.payload['repair_origin'] === 'unknown'
  )
    return 'unknown';
  return record.repairOrigin === undefined ? 'ordinary' : 'repair';
}

async function observe(
  context: RepairContext,
  record: StoredLogRecord,
  fingerprint: string,
): Promise<void> {
  try {
    const profileId = await profileOf(context, record);
    if (profileId === undefined) return;
    const retained = await retainedLogOf(context.store, context.logs, fingerprint, profileId);
    const result = await withExecutionAuthority(undefined, () =>
      context.assistant.repair.admit({
        id: repairEventId(fingerprint, null),
        fingerprint,
        profileId,
        recipient: { active: null, previousChatId: null },
        component: repairComponent(record),
        kind: 'automatic',
        origin: repairLogOrigin(record),
        evidence: repairEvidenceOf(record),
        retained,
      }),
    );
    if (result.kind === 'held' && result.reason !== 'disabled')
      context.log.info('repair.held', { reason: result.reason, component: record.scope });
  } catch (cause) {
    await context.store.host.call(
      'aiRepairInbox',
      'recordAutomaticFailure',
      fingerprint,
      repairEventId(fingerprint, null),
    );
    context.log.error('repair.admission_failed', cause, { component: record.scope });
  }
}

function retainedFailure(failure: NonNullable<RuntimeLogRow['failure']>): LogFailure {
  return {
    name: failure.name,
    message: failure.message,
    ...(failure.stack === undefined ? {} : { stack: failure.stack }),
    ...(failure.cause === undefined ? {} : { cause: retainedFailure(failure.cause) }),
  };
}

function retainedRecord(record: RuntimeLogRow, clientId: string | null): StoredLogRecord {
  const { release, bundle, failure, ...row } = record;
  return {
    ...row,
    clientId,
    failure: failure === null ? null : retainedFailure(failure),
    ...(release === null ? {} : { release }),
    ...(bundle === null ? {} : { bundle }),
  };
}

async function catchUp(context: RepairContext, profileId?: string): Promise<void> {
  const { store, logs } = context;
  const { settings, enabledAt: since } = await readAiRepairState(store);
  if (!settings.enabled) return;
  for (const { fingerprint, logId } of await store.host.call(
    'aiRepairInbox',
    'pendingAutomatic',
    true,
  )) {
    const [retained, client] = await Promise.all([
      logs.around({ owner: true, profileId: null }, { id: logId, before: 0, after: 0 }),
      logs.clientOf(logId),
    ]);
    if (retained === null || client === null || (since !== null && retained.anchor.at < since))
      continue;
    const record = retainedRecord(retained.anchor, client.clientId);
    if (profileId !== undefined && (await profileOf(context, record)) !== profileId) continue;
    await store.host.call('aiRepairInbox', 'retryAutomaticFailure', fingerprint);
    await observe(context, record, fingerprint);
  }
}

export function startRepair(context: RepairContext, _layout: HubLayout): () => void {
  const { store } = context;
  let active = true;
  const unobserve = context.logs.onRepairEvidence((record, fingerprint) => {
    background(
      readAiRepairState(store).then(async ({ settings, enabledAt }) => {
        if (!settings.enabled || (enabledAt !== null && record.at < enabledAt)) return;
        await observe(context, record, fingerprint);
      }),
      'repair.observe_failed',
    );
  });
  const unsubscribe = store.feed.subscribe((change) => {
    if (change.table !== 'ai_chats') return;
    const chat = change.record;
    if (
      chat?.source_key !== REPAIR_CHAT_SOURCE ||
      chat.archived_at !== null ||
      chat.deletion_state !== null
    )
      return;
    const previous = change.oldRecord;
    if (
      previous !== null &&
      previous.archived_at === null &&
      previous.deletion_state === null &&
      JSON.stringify(previous.engine) === JSON.stringify(chat.engine)
    )
      return;
    queueMicrotask(() => {
      if (active) background(catchUp(context, chat.profile_id), 'repair.catch_up_failed');
    });
  });
  const unobserveDefaults = store.live.engineDefaults.onChanged(() => {
    background(catchUp(context), 'repair.catch_up_failed');
  });
  background(catchUp(context), 'repair.catch_up_failed');
  return (): void => {
    active = false;
    unobserve();
    unsubscribe();
    unobserveDefaults();
  };
}
