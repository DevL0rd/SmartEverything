import { isCamera, type LiveChange, type TalkMemberKind } from '@smarteverything/domain';
import type { Store } from '../store/store';

export interface MemberLabel {
  readonly label: string;
  readonly detail: string | null;
}

export function memberLabel(store: Store, kind: TalkMemberKind, memberId: string): MemberLabel {
  if (kind === 'client') {
    const client = store.clients.byId(memberId);
    return { label: store.profiles.activeOf(memberId).name, detail: client.name };
  }
  store.cameras.byDevice(memberId);
  const device = store.devices.byId(memberId);
  return { label: device.display_name ?? device.name, detail: 'Camera' };
}

type LabelledMember = readonly [TalkMemberKind, string];

type ChangeOf<T extends LiveChange['table']> = Extract<LiveChange, { readonly table: T }>;

function clientRelabelled(change: ChangeOf<'clients'>): LabelledMember[] {
  const { record, oldRecord } = change;
  const moved =
    record !== null &&
    oldRecord !== null &&
    (record.name !== oldRecord.name || record.profile_id !== oldRecord.profile_id);
  return moved ? [['client', record.id]] : [];
}

function cameraRelabelled(change: ChangeOf<'devices'>): LabelledMember[] {
  const { record, oldRecord } = change;
  const renamed =
    record !== null &&
    oldRecord !== null &&
    isCamera(record) &&
    (record.name !== oldRecord.name || record.display_name !== oldRecord.display_name);
  return renamed ? [['camera', record.id]] : [];
}

function profileRelabelled(store: Store, change: ChangeOf<'profiles'>): LabelledMember[] {
  const { record, oldRecord } = change;
  if (record === null || oldRecord === null || record.name === oldRecord.name) {
    return [];
  }
  return store.clients
    .list()
    .filter((client) => client.profile_id === record.id)
    .map((client) => ['client', client.id]);
}

export function relabelledMembers(store: Store, change: LiveChange): LabelledMember[] {
  if (change.operation !== 'UPDATE') {
    return [];
  }
  if (change.table === 'clients') {
    return clientRelabelled(change);
  }
  if (change.table === 'devices') {
    return cameraRelabelled(change);
  }
  return change.table === 'profiles' ? profileRelabelled(store, change) : [];
}
