import {
  REPAIR_WORK_COMPONENT,
  type HubUpdateOrigin,
  type RepairWorkComponent,
} from '@smarteverything/domain';
import type { StoredLogRecord } from '../store/repositories/runtime-log-types';
import { repairWorkClaims, type RepairWorkClaim } from '../store/repositories/repair-work-claims';
import type { Store } from '../store/store';

type ClaimStore = Pick<Store, 'aiChats' | 'clients' | 'personAccess' | 'settingsKv'>;

export interface RepairWorkRecipient {
  readonly origin: HubUpdateOrigin;
  readonly expiresAt: string;
}

function repairWorkComponent(record: StoredLogRecord): RepairWorkComponent | undefined {
  const component = REPAIR_WORK_COMPONENT.safeParse(
    record.source === 'hub:service' ? record.scope : record.source,
  );
  return component.success ? component.data : undefined;
}

export function profileCanClaim(
  store: Pick<Store, 'clients' | 'personAccess'>,
  component: RepairWorkComponent,
  profileId: string,
): boolean {
  if (store.personAccess.find(profileId)?.role !== 'owner') return false;
  if (!component.startsWith('app:') && !component.startsWith('desktop:')) return true;
  const client = store.clients.find(component.slice(component.indexOf(':') + 1));
  return (
    client?.role === 'owner' &&
    client.profile_id === profileId &&
    (!component.startsWith('desktop:') || client.platform === 'desktop')
  );
}

function chatEligible(store: ClaimStore, claim: RepairWorkClaim): boolean {
  const chat = store.aiChats.find(claim.chatId);
  return (
    chat?.kind === 'chat' &&
    chat.profile_id === claim.profileId &&
    chat.archived_at === null &&
    chat.deletion_state === null
  );
}

function matchesEvidence(claim: RepairWorkClaim, record: StoredLogRecord): boolean {
  return (
    claim.claimedAt <= record.at &&
    (!claim.component.startsWith('app:') || record.clientId === claim.profileId)
  );
}

export function repairWorkRecipient(
  store: ClaimStore,
  record: StoredLogRecord,
): RepairWorkRecipient | undefined {
  const component = repairWorkComponent(record);
  if (component === undefined) return undefined;
  const claim = repairWorkClaims(store.settingsKv).find(
    (row) =>
      row.component === component &&
      matchesEvidence(row, record) &&
      profileCanClaim(store, component, row.profileId) &&
      chatEligible(store, row),
  );
  return claim === undefined
    ? undefined
    : {
        origin: { profileId: claim.profileId, chatId: claim.chatId },
        expiresAt: claim.expiresAt,
      };
}
