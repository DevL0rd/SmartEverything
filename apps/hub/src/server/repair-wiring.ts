import {
  repairEventId,
  repairEvidenceOf,
  type RepairRequest,
  type RepairDispatch,
} from '../assistant/repair-dispatch';
import { REPAIR_CHAT_SOURCE } from '../assistant/chat-directory';
import { withExecutionAuthority } from '../assistant/turn-authority';
import type { RuntimeLogRow } from '@smarteverything/domain';
import type { HubLayout } from '../data-layout';
import type { LogFailure, StoredLogRecord } from '../store/repositories/runtime-log-types';
import type { ServerContext } from './context';
import { repairComponent } from '../store/repositories/repair-fingerprint';
import { readAiRepairSettings, repairEnabledAt } from './handlers/ai-repair';

type RepairContext = Pick<ServerContext, 'store' | 'log'> & {
  readonly assistant: { readonly repair: Pick<RepairDispatch, 'admit'> };
};

function profileOf(context: RepairContext, record: StoredLogRecord): string | undefined {
  const owners = context.store.personAccess.ownerIds();
  if (record.runtime === 'app' && record.clientId !== null)
    return owners.find((owner) => owner === record.clientId);
  if (record.runtime === 'desktop' && record.deviceId !== null) {
    const client = context.store.clients.find(record.deviceId);
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

function observe(context: RepairContext, record: StoredLogRecord, fingerprint: string): void {
  try {
    const profileId = profileOf(context, record);
    if (profileId === undefined) return;
    const result = withExecutionAuthority(undefined, () =>
      context.assistant.repair.admit({
        id: repairEventId(fingerprint, null),
        fingerprint,
        profileId,
        recipient: { active: null, previousChatId: null },
        component: repairComponent(record),
        kind: 'automatic',
        origin: repairLogOrigin(record),
        evidence: repairEvidenceOf(record),
      }),
    );
    if (result.kind === 'held' && result.reason !== 'disabled')
      context.log.info('repair.held', { reason: result.reason, component: record.scope });
  } catch (cause) {
    context.store.aiRepairInbox.recordAutomaticFailure(
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

function catchUp(context: RepairContext, profileId?: string): void {
  const { store } = context;
  if (!readAiRepairSettings(store).enabled) return;
  const since = repairEnabledAt(store);
  for (const { fingerprint, logId, clientId } of store.aiRepairInbox.pendingAutomatic(true)) {
    const retained = store.runtimeLogs.around(
      { owner: true, profileId: null },
      { id: logId, before: 0, after: 0 },
    );
    if (retained === null || (since !== null && retained.anchor.at < since)) continue;
    const record = retainedRecord(retained.anchor, clientId);
    if (profileId !== undefined && profileOf(context, record) !== profileId) continue;
    store.aiRepairInbox.retryAutomaticFailure(fingerprint);
    observe(context, record, fingerprint);
  }
}

export function startRepair(context: RepairContext, _layout: HubLayout): () => void {
  const { store } = context;
  let active = true;
  const unobserve = store.runtimeLogs.onRepairEvidence((record, fingerprint) => {
    const enabledAt = repairEnabledAt(store);
    if (!readAiRepairSettings(store).enabled || (enabledAt !== null && record.at < enabledAt))
      return;
    observe(context, record, fingerprint);
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
      if (active) catchUp(context, chat.profile_id);
    });
  });
  const unobserveDefaults = store.aiEngineDefaults.onChanged(() => {
    catchUp(context);
  });
  catchUp(context);
  return (): void => {
    active = false;
    unobserve();
    unsubscribe();
    unobserveDefaults();
  };
}
