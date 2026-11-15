import { z } from 'zod';
import { UPDATE_RECOVER_INPUT } from './self-update-input';
import { HUB_UPDATE_RELEASE } from './self-update';

export const HUB_UPDATE_LEDGER_FILE = 'hub-update.json';

export const HUB_UPDATE_STATUS_CHANGED = z.strictObject({
  type: z.literal('hub_update_status_changed'),
});

export const RECOVERY_STATUS = z.strictObject({
  release: HUB_UPDATE_RELEASE.pick({
    runId: true,
    phase: true,
    interrupted: true,
    startedAt: true,
    updatedAt: true,
    finishedAt: true,
    reason: true,
    failedChecks: true,
  })
    .extend({ backupKept: z.boolean() })
    .nullable(),
});

export const RECOVERY_REQUEST = z.strictObject({
  runId: UPDATE_RECOVER_INPUT.shape.id,
  holdSeconds: UPDATE_RECOVER_INPUT.shape.holdSeconds,
});

export const ROLLBACK_REQUEST = z.strictObject({ runId: RECOVERY_REQUEST.shape.runId });

export const KEEP_REQUEST = ROLLBACK_REQUEST;

export const RECOVERY_RESULT = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('started'), runId: RECOVERY_REQUEST.shape.runId }),
  z.strictObject({
    status: z.literal('refused'),
    refusal: z.enum(['not_found', 'busy', 'not_recoverable', 'unavailable']),
  }),
]);

export type HubUpdateRecoveryStatus = z.infer<typeof RECOVERY_STATUS>;
export type HubUpdateRecoveryResult = z.infer<typeof RECOVERY_RESULT>;
export type HubUpdateRollbackRequest = z.infer<typeof ROLLBACK_REQUEST>;
export type HubUpdateKeepRequest = z.infer<typeof KEEP_REQUEST>;
