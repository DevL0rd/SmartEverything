import { ApiError } from '@smarteverything/domain';
import { clientOf, profileIdOf, type Caller } from '../server/auth';
import type { PhoneIdentity } from './phone-device';

export function androidOnly(caller: Caller, what: string): void {
  if (clientOf(caller).platform !== 'android') {
    throw new ApiError('invalid_request', `Only the Android app ${what}.`);
  }
}

export function phoneIdentityOf(caller: Caller, what: string): PhoneIdentity {
  androidOnly(caller, what);
  const client = clientOf(caller);
  return { clientId: client.id, name: client.name, profileId: profileIdOf(caller) };
}
