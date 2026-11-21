import { ownerOrSelf, profileIdOf, roleOfCaller, type Caller } from '../auth';
import type { HostStore } from '../../store/host/host-store';

export function plannerProfileOf(
  context: { readonly store: Pick<HostStore, 'profiles'> },
  caller: Caller,
  personId: string | undefined,
): string {
  const own = profileIdOf(caller);
  if (personId === undefined || personId === own) return own;
  ownerOrSelf(roleOfCaller(caller), false);
  return context.store.profiles.byId(personId).id;
}
