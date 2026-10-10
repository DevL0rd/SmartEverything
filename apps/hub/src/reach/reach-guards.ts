import type { AiOutreachRow, Role } from '@smarteverything/domain';
import type { Store } from '../store/store';
import { ReachRefusedError } from './reach-errors';

export interface Asker {
  readonly profileId: string;
  readonly role: Role;
  readonly clientId: string | null;
  readonly chatId: string | null;
}

const WINDOW_MS = 10 * 60_000;
export const OUTREACH_PER_WINDOW = 6;

export function mayReach(asker: Asker, personId: string): void {
  if (asker.role !== 'owner' && asker.profileId !== personId) {
    throw new ReachRefusedError('Only an owner’s AI can reach other people.');
  }
}

export function mayManage(asker: Asker, row: AiOutreachRow): void {
  if (asker.role !== 'owner' && asker.profileId !== row.profile_id) {
    throw new ReachRefusedError('That outreach belongs to someone else.');
  }
}

export function withinLimit(
  store: Pick<Store, 'aiOutreach' | 'profiles'>,
  personId: string,
  now: Date,
): void {
  const since = new Date(now.getTime() - WINDOW_MS).toISOString();
  if (store.aiOutreach.callsSince(personId, since) >= OUTREACH_PER_WINDOW) {
    const name = store.profiles.byId(personId).name;
    throw new ReachRefusedError(
      `You already reached ${name} ${String(OUTREACH_PER_WINDOW)} times in the last 10 minutes; wait before trying again.`,
    );
  }
}
