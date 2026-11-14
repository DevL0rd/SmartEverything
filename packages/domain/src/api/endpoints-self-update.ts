import { SELF_UPDATE_RECOVERY_PATH, UPDATE_PIPELINE, UPDATE_REVISIONS_PATH } from '../self-update';
import { RECOVERY_REQUEST, RECOVERY_RESULT, RECOVERY_STATUS } from '../self-update-recovery';
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
