import { z } from 'zod';
import { RELEASE_NOTES } from './release-notes';

export const HUB_UPDATE_COMMIT = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u);

export const HUB_UPDATE_SOURCE_PATH = '/api/hub-updates/source';
export const HUB_UPDATE_HOST_PLATFORM = 'linux';

export const HUB_UPDATE_SOURCE_CHECK = z.strictObject({
  remote: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u),
  branch: z.string().min(1),
  head: HUB_UPDATE_COMMIT,
  tip: HUB_UPDATE_COMMIT,
  relation: z.enum(['same', 'remote_ahead', 'local_ahead', 'diverged', 'unknown']),
  offerId: z.uuid().optional(),
  availableUpdate: z.enum(['source_ahead', 'running_behind']).optional(),
  notes: RELEASE_NOTES.optional(),
  applyBlockedBy: z
    .enum([
      'owner_required',
      'unsupported_host',
      'checkout_conflicts',
      'checkout_not_ancestor',
      'tracked_branch_required',
    ])
    .optional(),
  tipIsRunning: z.literal(true).optional(),
  pending: z.strictObject({
    staged: z.number().int().nonnegative(),
    unstaged: z.number().int().nonnegative(),
    untracked: z.number().int().nonnegative(),
    conflicts: z.number().int().nonnegative(),
  }),
});

export type HubUpdateSourceCheck = z.infer<typeof HUB_UPDATE_SOURCE_CHECK>;

export const HUB_UPDATE_SOURCE_START_PATH = `${HUB_UPDATE_SOURCE_PATH}/start`;

export const HUB_UPDATE_SOURCE_START = z
  .strictObject({
    offerId: z.uuid(),
    requestId: z.uuid(),
    includePending: z.boolean(),
    savedRequestId: z.uuid().optional(),
  })
  .refine(
    ({ includePending, savedRequestId, requestId }) =>
      savedRequestId === undefined || (!includePending && savedRequestId !== requestId),
    { message: 'Choose either to include pending files or to release after saving them.' },
  );

export type HubUpdateSourceStart = z.infer<typeof HUB_UPDATE_SOURCE_START>;

export const HUB_UPDATE_SOURCE_SAVE_PATH = `${HUB_UPDATE_SOURCE_PATH}/save`;

const RECOVERY_BRANCH = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[^\s-][^\s]*$/u);

export const HUB_UPDATE_SOURCE_SAVE = z.strictObject({
  offerId: z.uuid(),
  requestId: z.uuid(),
  branch: RECOVERY_BRANCH,
});

export type HubUpdateSourceSave = z.infer<typeof HUB_UPDATE_SOURCE_SAVE>;

export const HUB_UPDATE_SOURCE_SAVED = z.strictObject({
  branch: RECOVERY_BRANCH,
  commit: HUB_UPDATE_COMMIT,
});

export type HubUpdateSourceSaved = z.infer<typeof HUB_UPDATE_SOURCE_SAVED>;
