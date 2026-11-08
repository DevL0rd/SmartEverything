import { z } from 'zod';
import { DRIVE_PLACEMENT, DRIVE_PLACEMENT_STATUS_FIELDS } from '../drive/placement';

export const HUB_PLACEMENTS_FRAME = z.strictObject({
  type: z.literal('placements'),
  placements: z.array(DRIVE_PLACEMENT).readonly(),
});

export type HubPlacementsFrame = z.infer<typeof HUB_PLACEMENTS_FRAME>;

export const NODE_PLACEMENT_STATE_FRAME = z.strictObject({
  type: z.literal('placement_state'),
  placementId: z.uuid(),
  ...DRIVE_PLACEMENT_STATUS_FIELDS,
});

export type NodePlacementStateFrame = z.infer<typeof NODE_PLACEMENT_STATE_FRAME>;
