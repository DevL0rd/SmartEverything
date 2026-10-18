import type { EndpointShape } from '@smarteverything/domain';
import type { Store } from '../store/store';
import { roleOfCaller, type Caller } from './auth';
import { refusal } from './person-access';

export function assertOwnerRoute(
  store: Store,
  caller: Caller,
  endpoint: Pick<EndpointShape, 'access' | 'method' | 'path'>,
): void {
  if (endpoint.access !== 'owner' || caller.kind !== 'client' || roleOfCaller(caller) === 'owner') {
    return;
  }
  throw refusal(store, caller.client, {
    kind: 'refused_scope',
    detail: `an owner-only call was refused: ${endpoint.method} ${endpoint.path}`,
    message: 'Only an owner may do this.',
  });
}
