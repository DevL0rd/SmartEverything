import type { ApiError } from '@smarteverything/domain';
import type { Caller } from '../server/auth';
import { refusal, type Refusal } from '../server/person-access';
import { subjectOf } from '../server/person-scope';
import type { Store } from '../store/store';
import type { Reached } from './service-reach';

export function admitReach<T>(store: Pick<Store, 'host'>, caller: Caller, result: Reached<T>): T {
  if (result.kind === 'refused') throw reachRefusal(store, caller, result.why);
  return result.value;
}

export function reachRefusal(store: Pick<Store, 'host'>, caller: Caller, why: Refusal): ApiError {
  return refusal(store, subjectOf(caller), why);
}
