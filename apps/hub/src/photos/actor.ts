import type { DriveActor } from '../drive/access';
import { profileIdOf, type Caller } from '../server/auth';
import type { Store } from '../store/store';

export function photoActor(store: Store, caller: Caller): DriveActor {
  return { profileId: profileIdOf(store, caller) };
}
