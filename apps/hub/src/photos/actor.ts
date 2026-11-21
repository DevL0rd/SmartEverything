import type { DriveActor } from '../drive/access';
import { profileIdOf, type Caller } from '../server/auth';

export function photoActor(caller: Caller): DriveActor {
  return { profileId: profileIdOf(caller) };
}
