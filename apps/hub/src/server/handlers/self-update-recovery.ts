import {
  API_ENDPOINTS as E,
  type HubUpdateRecoveryResult,
  type HubUpdateRecoveryStatus,
} from '@smarteverything/domain';
import { bound, type Routes } from '../router';

export interface HubUpdateRecovery {
  readonly status: () => Promise<HubUpdateRecoveryStatus>;
  readonly recover: (runId: string, holdSeconds: number) => Promise<HubUpdateRecoveryResult>;
  readonly rollback: (runId: string) => Promise<HubUpdateRecoveryResult>;
  readonly keep: (runId: string) => Promise<HubUpdateRecoveryResult>;
}

export function selfUpdateRecoveryRoutes(
  service: HubUpdateRecovery,
): Routes<'readHubUpdateRecovery' | 'recoverHubUpdate' | 'rollbackHubUpdate' | 'keepHubUpdate'> {
  return {
    readHubUpdateRecovery: bound(E.readHubUpdateRecovery, () => service.status()),
    recoverHubUpdate: bound(E.recoverHubUpdate, ({ body }) =>
      service.recover(body.runId, body.holdSeconds),
    ),
    rollbackHubUpdate: bound(E.rollbackHubUpdate, ({ body }) => service.rollback(body.runId)),
    keepHubUpdate: bound(E.keepHubUpdate, ({ body }) => service.keep(body.runId)),
  };
}
