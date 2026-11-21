import {
  AI_REPAIR_SETTINGS,
  ApiError,
  type AiChatRow,
  type AiRepairAdmission,
} from '@smarteverything/domain';
import { durableStoreUnit, storeUnit } from '../store/host/unit';
import type { HostStore } from '../store/host/host-store';
import { assertHeldQueued, type HeldChats } from '../store/repositories/ai-chat-removal-hold';
import type { StoredEvent } from '../store/repositories/assistant-events';
import { addPersonMessage, queueEventNow } from './store-units';
import type { AuthorityScope } from './turn-authority';

export interface RepairExistingRequest {
  readonly id: string;
  readonly profileId: string;
}

export function existingRepair(
  store: HostStore,
  input: RepairExistingRequest,
): AiRepairAdmission | undefined {
  const event = store.assistantEvents.find(input.id);
  if (event === undefined) return undefined;
  const authority = store.harnessRecovery.authority(input.id);
  if (authority?.repair_origin !== input.id || event.profile_id !== input.profileId)
    throw new ApiError('conflict', 'This repair identifier belongs to different work.');
  return { kind: 'existing', eventId: input.id, chatId: event.chat_id };
}

export interface RepairPatchCheck extends RepairExistingRequest {
  readonly revision: string;
  readonly paths: readonly string[];
}

function existingPatch(store: HostStore, input: RepairPatchCheck): AiRepairAdmission | undefined {
  const existing = existingRepair(store, input);
  if (existing === undefined) return undefined;
  const approval = store.aiRepairInbox.patchApproval(input.id);
  if (
    approval?.revision !== input.revision ||
    approval.paths.length !== input.paths.length ||
    approval.paths.some((path) => !input.paths.includes(path))
  )
    throw new ApiError('conflict', 'Use a new request for a different source approval.');
  return existing;
}

export interface RepairAdmission {
  readonly id: string;
  readonly fingerprint: string | undefined;
  readonly profileId: string;
  readonly kind: 'automatic' | 'manual';
  readonly chat: AiChatRow | null;
  readonly text: string;
  readonly patch: { readonly revision: string; readonly paths: readonly string[] } | null;
  readonly held: HeldChats;
  readonly scope: AuthorityScope;
}

function eligible(store: HostStore, chat: AiChatRow | null, profileId: string): chat is AiChatRow {
  if (chat === null)
    throw new ApiError(
      'conflict',
      'The repair request changed while it was being admitted. Try again.',
    );
  const current = store.aiChats.find(chat.id);
  return (
    current?.profile_id === profileId &&
    current.archived_at === null &&
    current.deletion_state === null &&
    (current.kind === 'chat' || current.kind === 'subagent')
  );
}

function mayEnqueue(
  store: HostStore,
  input: Pick<RepairAdmission, 'fingerprint' | 'kind'>,
): boolean {
  if (input.fingerprint === undefined) return true;
  const inbox = store.aiRepairInbox;
  return (
    inbox.isVisible(input.fingerprint) &&
    (input.kind === 'manual' || inbox.mayAutoAdmit(input.fingerprint))
  );
}

export interface RepairAdmitted {
  readonly admission: AiRepairAdmission;
  readonly event: StoredEvent | null;
}

function enqueue(store: HostStore, input: RepairAdmission): RepairAdmitted {
  const existing = existingRepair(store, input);
  if (existing !== undefined) return { admission: existing, event: null };
  const settings = AI_REPAIR_SETTINGS.parse(
    store.settingsKv.read('ai-repair') ?? { enabled: false },
  );
  if (input.kind === 'automatic' && !settings.enabled)
    return { admission: { kind: 'held', reason: 'disabled' }, event: null };
  const { chat } = input;
  if (!eligible(store, chat, input.profileId))
    throw new ApiError('forbidden', 'The repair chat is no longer available.');
  const message = addPersonMessage(store, {
    chat,
    clientId: null,
    author: 'AI repair',
    text: input.text,
    files: [],
    origin: { source: 'hub', plugin_id: null, device_id: null, name: 'AI repair' },
  });
  assertHeldQueued(input.held, chat.id);
  const event = queueEventNow(store, {
    event: {
      id: input.id,
      kind: 'chat',
      chat_id: chat.id,
      message_id: message.id,
      profile_id: input.profileId,
      client_id: null,
      text: input.text,
    },
    scope: input.scope,
  });
  if (input.patch !== null) store.aiRepairInbox.recordPatchApproval(event.id, input.patch);
  return { admission: { kind: 'queued', eventId: event.id, chatId: chat.id }, event };
}

function admitRepair(store: HostStore, input: RepairAdmission): RepairAdmitted {
  if (!mayEnqueue(store, input))
    return {
      admission: existingRepair(store, input) ?? { kind: 'held', reason: 'evidence' },
      event: null,
    };
  const admitted = enqueue(store, input);
  const { admission } = admitted;
  if (input.fingerprint !== undefined) {
    store.aiRepairInbox.recordAdmission(input.fingerprint, admission);
    if (input.kind === 'automatic' && admission.kind !== 'held')
      store.aiRepairInbox.markAutomaticAdmitted(input.fingerprint);
  }
  return admitted;
}

export interface RepairPlanRequest extends RepairExistingRequest {
  readonly fingerprint: string | undefined;
  readonly kind: 'automatic' | 'manual';
}

function needsRepairChat(store: HostStore, input: RepairPlanRequest): boolean {
  if (!mayEnqueue(store, input) || existingRepair(store, input) !== undefined) return false;
  const settings = AI_REPAIR_SETTINGS.parse(
    store.settingsKv.read('ai-repair') ?? { enabled: false },
  );
  return input.kind === 'manual' || settings.enabled;
}

export const REPAIR_NEEDS_CHAT_UNIT = storeUnit(needsRepairChat);
export const REPAIR_EXISTING_UNIT = storeUnit(existingRepair);
export const REPAIR_EXISTING_PATCH_UNIT = storeUnit(existingPatch);
export const REPAIR_ADMIT_UNIT = durableStoreUnit(admitRepair);
