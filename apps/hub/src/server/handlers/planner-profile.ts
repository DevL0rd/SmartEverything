import type { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { z } from 'zod';
import type { Store } from '../../store/store';
import { ownerOrSelf, profileIdOf, roleOfCaller, type Caller } from '../auth';

export interface PlannerContext {
  readonly store: Store;
}

interface Asked<Q, B, P> {
  readonly caller: Caller;
  readonly query: Q;
  readonly body: B;
  readonly params: P;
}

export type PlannerAsk<N extends keyof typeof E> = Asked<
  z.output<(typeof E)[N]['query']>,
  z.output<(typeof E)[N]['body']>,
  z.output<(typeof E)[N]['params']>
>;

export function plannerProfileOf(
  context: PlannerContext,
  caller: Caller,
  personId: string | undefined,
): string {
  const own = profileIdOf(caller);
  if (personId === undefined || personId === own) return own;
  ownerOrSelf(roleOfCaller(caller), false);
  return context.store.profiles.byId(personId).id;
}

export async function plannerProfileFor(
  context: { readonly store: Pick<Store, 'host'> },
  caller: Caller,
  personId: string | undefined,
): Promise<string> {
  const own = profileIdOf(caller);
  if (personId === undefined || personId === own) return own;
  ownerOrSelf(roleOfCaller(caller), false);
  return (await context.store.host.call('profiles', 'byId', personId)).id;
}
