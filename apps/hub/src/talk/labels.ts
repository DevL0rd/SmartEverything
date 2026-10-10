import type { TalkMemberKind } from '@smarteverything/domain';
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
