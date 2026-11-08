import {
  API_ENDPOINTS as E,
  type SelfUpdateRecoveryResult,
  type SelfUpdateRecoveryStatus,
} from '@smarteverything/domain';
import { bound, type Routes } from '../router';

export interface HubUpdateRecovery {
  readonly status: () => Promise<SelfUpdateRecoveryStatus>;
  readonly recover: (runId: string, holdSeconds: number) => Promise<SelfUpdateRecoveryResult>;
}

export function selfUpdateRecoveryRoutes(
  service: HubUpdateRecovery,
): Routes<'readHubUpdateRecovery' | 'recoverHubUpdate'> {
  return {
    readHubUpdateRecovery: bound(E.readHubUpdateRecovery, () => service.status()),
    recoverHubUpdate: bound(E.recoverHubUpdate, ({ body }) =>
      service.recover(body.runId, body.holdSeconds),
    ),
  };
}
