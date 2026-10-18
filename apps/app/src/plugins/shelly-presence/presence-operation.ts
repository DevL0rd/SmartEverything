import { JSON_VALUE } from '@smarteverything/domain';
import {
  SHELLY_PLUGIN_ID,
  shellyOperation,
  type ShellyAction,
  type ShellyDevice,
} from '@smarteverything/shelly';
import { z } from 'zod';
import { callPluginTool } from '../../api/plugins';

const OUTCOME = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('accepted'),
    action: z.string(),
    result: JSON_VALUE,
    restartRequired: z.boolean(),
    revision: z.int().nonnegative().nullable(),
    confirmed: z.boolean().optional(),
  }),
  z.object({ state: z.literal('unknown'), action: z.string(), message: z.string() }),
]);
type PresenceOutcome = z.output<typeof OUTCOME>;
export type AcceptedOutcome = Extract<PresenceOutcome, { readonly state: 'accepted' }>;

export interface PresenceRequest {
  readonly action: ShellyAction;
  readonly params?: Readonly<Record<string, unknown>>;
}

const DESTRUCTIVE_METHOD = /\.(Delete\w*|FactoryReset)$/;

export function isDestructive(action: ShellyAction): boolean {
  return DESTRUCTIVE_METHOD.test(shellyOperation(action).method);
}

export function actionAvailable(sensor: ShellyDevice, action: ShellyAction): boolean {
  return sensor.features.some((feature) => feature.id === action && feature.available);
}

export async function operatePresence(
  sensor: ShellyDevice,
  request: PresenceRequest,
): Promise<PresenceOutcome> {
  const reply = await callPluginTool(SHELLY_PLUGIN_ID, 'operate', {
    externalId: sensor.externalId,
    action: request.action,
    params: request.params ?? {},
  });
  return OUTCOME.parse(reply.result);
}
