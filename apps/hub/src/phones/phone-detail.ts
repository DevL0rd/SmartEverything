import {
  phoneDetailFor,
  phoneDetailPartsFor,
  phoneTierOf,
  type ClientRow,
  type PhoneDetail,
  type PhoneDetailNotice,
  type PhoneDetailSectionName,
  type PhoneTier,
  type Role,
} from '@smarteverything/domain';
import { profileIdOf, roleOfCaller, type Caller } from '../server/auth';
import type { Store } from '../store/store';
import type { PhoneTarget } from './phone-nodes';

export interface PhoneViewer {
  readonly role: Role;
  readonly profileId: string | null;
}

export function phoneViewerOfCaller(store: Store, caller: Caller): PhoneViewer {
  return { role: roleOfCaller(caller), profileId: profileIdOf(store, caller) };
}

export function phoneViewerOfClient(
  store: Pick<Store, 'profiles'>,
  client: ClientRow,
): PhoneViewer {
  return { role: client.role, profileId: store.profiles.activeOf(client.id).id };
}

export function tierOfViewer(
  target: Pick<PhoneTarget, 'profileId'>,
  viewer: PhoneViewer,
): PhoneTier {
  return phoneTierOf({
    phoneProfileId: target.profileId,
    viewerProfileId: viewer.profileId,
    viewerRole: viewer.role,
  });
}

export function readPhoneDetail(
  store: Pick<Store, 'phoneDetails'>,
  target: PhoneTarget,
  viewer: PhoneViewer,
  sections: readonly PhoneDetailSectionName[] | undefined,
): PhoneDetail {
  const stored = store.phoneDetails.read(target.deviceId);
  const wanted = sections === undefined ? stored : pickSections(stored, sections);
  return phoneDetailFor(wanted, tierOfViewer(target, viewer));
}

function pickSections(
  detail: PhoneDetail,
  sections: readonly PhoneDetailSectionName[],
): PhoneDetail {
  return Object.fromEntries(
    Object.entries(detail).filter(([name]) => sections.some((wanted) => wanted === name)),
  );
}

export function detailNotice(
  target: PhoneTarget,
  parts: PhoneDetail,
  viewer: PhoneViewer,
): PhoneDetailNotice | null {
  const cut = phoneDetailPartsFor(parts, tierOfViewer(target, viewer));
  return cut === null ? null : { type: 'phone_detail', deviceId: target.deviceId, parts: cut };
}

export function detailKeyframe(
  store: Pick<Store, 'phoneDetails'>,
  target: PhoneTarget,
  viewer: PhoneViewer,
): PhoneDetailNotice | null {
  return detailNotice(target, store.phoneDetails.read(target.deviceId), viewer);
}
