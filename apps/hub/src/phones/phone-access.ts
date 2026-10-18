import {
  ApiError,
  phoneActionAllowed,
  phoneActionPersonOnly,
  phoneTierOf,
  type DeviceRow,
  type PhoneActionType,
  type PhoneTier,
  type Role,
} from '@smarteverything/domain';
import { phoneActionTypeOf } from './phone-driver';

export interface PhoneCommandViewer {
  readonly role: Role;
  readonly profileId: string;
}

export function assertPhoneActionAllowed(
  action: { readonly type: PhoneActionType },
  tier: PhoneTier,
): void {
  if (phoneActionAllowed(action, tier)) return;
  throw new ApiError(
    'forbidden',
    phoneActionPersonOnly(action.type)
      ? 'Only the person who owns this phone can do this.'
      : 'Only an owner can do this for another person.',
  );
}

export function assertPhoneCommandAllowed(
  device: Pick<DeviceRow, 'kind' | 'details'>,
  capability: string,
  viewer: PhoneCommandViewer,
): void {
  const owner = device.details['profileId'];
  if (device.kind !== 'phone' || typeof owner !== 'string') return;
  const tier = phoneTierOf({
    phoneProfileId: owner,
    viewerProfileId: viewer.profileId,
    viewerRole: viewer.role,
  });
  const type = phoneActionTypeOf(capability);
  if (type !== undefined) assertPhoneActionAllowed({ type }, tier);
}
