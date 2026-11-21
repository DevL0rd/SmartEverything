import { ApiError, type PlannerItemRow } from '@smarteverything/domain';
import type { HostStore } from '../store/host/host-store';

export type ProposalStore = Pick<HostStore, 'plannerItems'>;

function proposed(store: ProposalStore, profileId: string, id: string): PlannerItemRow {
  const item = store.plannerItems.find(id, profileId);
  if (item?.status !== 'proposed') {
    throw new ApiError('not_found', 'That proposal does not exist.');
  }
  return item;
}

export function listProposals(store: ProposalStore, profileId: string): PlannerItemRow[] {
  return store.plannerItems.list(profileId, { statuses: ['proposed'] });
}

export function acceptProposal(
  store: ProposalStore,
  profileId: string,
  id: string,
): PlannerItemRow {
  proposed(store, profileId, id);
  return store.plannerItems.update(id, profileId, { status: 'open' });
}

export function rejectProposal(store: ProposalStore, profileId: string, id: string): void {
  proposed(store, profileId, id);
  store.plannerItems.purge(id, profileId);
}
