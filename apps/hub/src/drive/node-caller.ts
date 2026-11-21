import {
  ApiError,
  effectiveRoleOf,
  isExpired,
  type ClientRow,
  type ComputerNodeRow,
} from '@smarteverything/domain';
import type { Caller } from '../server/auth';
import type { Store } from '../store/store';

export const COMPUTER_NOT_BOUND_TO_PERSON = 'computer_not_bound_to_person';

type NodeStore = Pick<Store, 'host' | 'now'>;

function refused(message: string): ApiError {
  return new ApiError('forbidden', message, COMPUTER_NOT_BOUND_TO_PERSON);
}

export async function nodeCaller(store: NodeStore, node: ComputerNodeRow): Promise<Caller> {
  if (node.revoked_at !== null) {
    throw refused('This computer was unpaired and can no longer reach the library.');
  }
  const held = await store.host.read('driveNodeStanding', node.device_id);
  if (held === null) {
    throw refused('This computer is not paired for a person, so it cannot reach the library.');
  }
  const { profileId, standing } = held;
  if (!standing.known || isExpired(standing, store.now().toISOString())) {
    throw refused('The access of the person this computer is paired for has ended.');
  }
  const client: ClientRow = {
    id: node.device_id,
    name: 'Computer',
    platform: 'desktop',
    kind: 'computer',
    role: effectiveRoleOf('owner', standing.role),
    built_in: false,
    profile_id: profileId,
    created_at: node.paired_at,
    last_seen_at: null,
  };
  return { kind: 'client', client, profileId };
}
