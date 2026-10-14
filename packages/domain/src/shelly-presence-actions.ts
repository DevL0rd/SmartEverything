import { SHELLY_ADVANCED_ACTIONS } from './shelly-presence-advanced-actions';
import { SHELLY_DYNAMIC_ACTIONS } from './shelly-presence-dynamic-actions';
import { SHELLY_RESOURCE_ACTIONS } from './shelly-presence-resource-actions';
import { SHELLY_MANAGEMENT_ACTIONS } from './shelly-presence-management-actions';
import { z } from 'zod';
import { SHELLY_OPERATION_RESULT } from './shelly-presence-results';
import { SHELLY_COMPONENT_PATCH } from './shelly-presence-components';
import {
  SHELLY_LIGHT_PATCH,
  SHELLY_PRESENCE_PATCH,
  SHELLY_ZONE_CREATE,
  SHELLY_ZONE_PATCH,
} from './shelly-presence-actions-core';
import { SHELLY_COMPONENT_ID, SHELLY_REVISION } from './shelly-presence-primitives';

const REVISION = { expectedRevision: SHELLY_REVISION.optional() };
export const SHELLY_PRESENCE_CORE_ACTIONS = [
  z.strictObject({ action: z.literal('set_presence'), config: SHELLY_PRESENCE_PATCH, ...REVISION }),
  z.strictObject({
    action: z.literal('set_zone'),
    id: SHELLY_COMPONENT_ID,
    config: SHELLY_ZONE_PATCH,
    ...REVISION,
  }),
  z.strictObject({ action: z.literal('add_zone'), config: SHELLY_ZONE_CREATE, ...REVISION }),
  z.strictObject({ action: z.literal('delete_zone'), id: SHELLY_COMPONENT_ID, ...REVISION }),
  z.strictObject({
    action: z.literal('set_light'),
    id: SHELLY_COMPONENT_ID,
    config: SHELLY_LIGHT_PATCH,
    ...REVISION,
  }),
  z.strictObject({ action: z.literal('set_detection'), enable: z.boolean(), ...REVISION }),
  z.strictObject({ action: z.literal('calibrate'), ...REVISION }),
  z.strictObject({ action: z.literal('live_track') }),
  z.strictObject({
    action: z.literal('set_component'),
    config: SHELLY_COMPONENT_PATCH,
    ...REVISION,
  }),
  z.strictObject({ action: z.literal('refresh') }),
  z.strictObject({ action: z.literal('reconnect') }),
] as const;
export const SHELLY_PRESENCE_ACTION = z.discriminatedUnion('action', [
  ...SHELLY_PRESENCE_CORE_ACTIONS,
  ...SHELLY_RESOURCE_ACTIONS,
  ...SHELLY_MANAGEMENT_ACTIONS,
  ...SHELLY_DYNAMIC_ACTIONS,
  ...SHELLY_ADVANCED_ACTIONS,
]);
export type ShellyPresenceAction = z.output<typeof SHELLY_PRESENCE_ACTION>;
export const SHELLY_PRESENCE_ARGUMENTS = [
  ...new Set(SHELLY_PRESENCE_ACTION.options.flatMap((option) => Object.keys(option.shape))),
];
export const SHELLY_PRESENCE_ACTION_REQUEST = z.strictObject({
  externalId: z.string().min(1).max(200),
  operation: SHELLY_PRESENCE_ACTION,
});
export const SHELLY_PRESENCE_OUTCOME = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('accepted'),
    action: z.string(),
    restartRequired: z.boolean(),
    revision: SHELLY_REVISION.nullable(),
    result: SHELLY_OPERATION_RESULT.optional(),
    readback: z.enum(['confirmed', 'unavailable']).optional(),
  }),
  z.object({ state: z.literal('unknown'), action: z.string(), message: z.string().max(500) }),
]);
export type ShellyPresenceOutcome = z.output<typeof SHELLY_PRESENCE_OUTCOME>;

export const SHELLY_PRESENCE_LIVE_VIEW_RESULT = z.object({
  enabled: z.boolean(),
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
  renewAfterMs: z.number().positive().nullable(),
});
