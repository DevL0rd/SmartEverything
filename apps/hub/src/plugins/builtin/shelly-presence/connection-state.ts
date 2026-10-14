import type { ShellyPresenceDevice } from '@smarteverything/domain';
import { ShellyAuthenticationError } from './rpc-auth';

export function failureConnection(
  cause: unknown,
  reason: string,
): ShellyPresenceDevice['connection'] {
  return { state: cause instanceof ShellyAuthenticationError ? 'needs_auth' : 'offline', reason };
}
