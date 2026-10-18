import { z } from 'zod';
import { SHELLY_REVISION } from './primitives';
import { SHELLY_DEVICE_OPERATIONS } from './catalogue-device';
import { SHELLY_RESOURCE_OPERATIONS } from './catalogue-resources';
import type { ShellyDispatch, ShellyOperation } from './operation';

export const SHELLY_CATALOGUE = { ...SHELLY_DEVICE_OPERATIONS, ...SHELLY_RESOURCE_OPERATIONS };
export type ShellyAction = keyof typeof SHELLY_CATALOGUE;
export const SHELLY_ACTIONS: readonly ShellyAction[] = Object.keys(SHELLY_CATALOGUE).filter(
  (name): name is ShellyAction => name in SHELLY_CATALOGUE,
);
export const SHELLY_ACTION = z.enum(SHELLY_ACTIONS);

const SELECTORS = {
  config: z.object({ config: z.object({ component: z.string() }) }).transform((v) => v.config),
  setting: z.object({ setting: z.object({ component: z.string() }) }).transform((v) => v.setting),
};

export function shellyOperation(action: ShellyAction): ShellyOperation {
  return SHELLY_CATALOGUE[action];
}

export function shellyMethod(action: ShellyAction, params: unknown): string {
  const { method, dispatch } = SHELLY_CATALOGUE[action];
  if (dispatch === null) return method;
  const { component } = SELECTORS[dispatch.key].parse(parseShellyParams(action, params));
  return shellyDispatchMethod(dispatch, component);
}

export function shellyDispatchMethod(dispatch: ShellyDispatch, component: string): string {
  const method = dispatch.methods[component];
  if (method === undefined) throw new Error(`No Shelly method for component ${component}.`);
  return method;
}

export function shellyActionMethods(action: ShellyAction): readonly string[] {
  const { method, dispatch } = SHELLY_CATALOGUE[action];
  return dispatch === null ? [method] : Object.values(dispatch.methods);
}

export function shellyActionAvailable(action: ShellyAction, listed: readonly string[]): boolean {
  const known = new Set(listed.map((method) => method.toLowerCase()));
  return shellyActionMethods(action).some((method) => known.has(method.toLowerCase()));
}

export const SHELLY_ACTION_REQUEST = z
  .strictObject({
    externalId: z.string().min(1),
    action: SHELLY_ACTION,
    params: z.record(z.string(), z.unknown()).default({}),
    expectedRevision: SHELLY_REVISION.optional(),
  })
  .refine(
    (request) =>
      request.expectedRevision === undefined || SHELLY_CATALOGUE[request.action].revisioned,
    {
      path: ['expectedRevision'],
      error: 'Only whole-list schedule and action edits carry a revision.',
    },
  );

export function parseShellyParams(action: ShellyAction, params: unknown): Record<string, unknown> {
  return SHELLY_CATALOGUE[action].params.parse(params);
}
