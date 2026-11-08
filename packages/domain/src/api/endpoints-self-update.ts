import { SELF_UPDATE_RECOVERY_PATH } from '../self-update';
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
} as const;
