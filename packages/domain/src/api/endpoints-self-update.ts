import { SELF_UPDATE_RECOVERY_PATH, UPDATE_PIPELINE, UPDATE_REVISIONS_PATH } from '../self-update';
import {
  KEEP_REQUEST,
  RECOVERY_REQUEST,
  RECOVERY_RESULT,
  RECOVERY_STATUS,
  ROLLBACK_REQUEST,
} from '../self-update-recovery';
import { NO_BODY, endpoint } from './endpoint';
import { NOTHING } from './primitives';

export const SELF_UPDATE_ENDPOINTS = {
  readHubUpdateRecovery: endpoint({
    method: 'GET',
    path: SELF_UPDATE_RECOVERY_PATH,
    access: 'owner',
    summary: 'Read the latest hub release recovery status',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: RECOVERY_STATUS,
  }),
  recoverHubUpdate: endpoint({
    method: 'POST',
    path: SELF_UPDATE_RECOVERY_PATH,
    access: 'owner',
    summary: 'Hand an interrupted hub release to the recovery watchdog',
    params: NOTHING,
    query: NOTHING,
    body: RECOVERY_REQUEST,
    response: RECOVERY_RESULT,
  }),
  rollbackHubUpdate: endpoint({
    method: 'POST',
    path: `${SELF_UPDATE_RECOVERY_PATH}/rollback`,
    access: 'owner',
    summary:
      'Restore the backup of a hub release that waits for the owner’s decision or could not be recovered; only on the owner’s order, never automatic',
    params: NOTHING,
    query: NOTHING,
    body: ROLLBACK_REQUEST,
    response: RECOVERY_RESULT,
  }),
  keepHubUpdate: endpoint({
    method: 'POST',
    path: `${SELF_UPDATE_RECOVERY_PATH}/keep`,
    access: 'owner',
    summary:
      'Keep a hub release that waits for the owner’s decision as it is: nothing is restored, the backup stays, and the release counts as finished so new hub updates can start; only on the owner’s order',
    params: NOTHING,
    query: NOTHING,
    body: KEEP_REQUEST,
    response: RECOVERY_RESULT,
  }),
  readUpdateRevisions: endpoint({
    method: 'GET',
    path: UPDATE_REVISIONS_PATH,
    access: 'owner',
    summary:
      'Read the pushed Git revisions the update pipeline has released or is releasing, and whether the push webhook is set up',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: UPDATE_PIPELINE,
  }),
} as const;
