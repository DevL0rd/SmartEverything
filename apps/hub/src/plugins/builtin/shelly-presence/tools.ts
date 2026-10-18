import { ApiError } from '@smarteverything/domain';
import {
  SHELLY_ACTION,
  SHELLY_ACTION_REQUEST,
  SHELLY_ACTIONS,
  SHELLY_ENROLL_REQUEST,
  shellyOperation,
  type ShellyDevice,
  type ShellySnapshot,
} from '@smarteverything/shelly';
import { z } from 'zod';
import type { PluginTool, ToolCaller } from '../contract';
import { definePluginTool } from '../define';
import {
  attemptTool,
  DANGER_HINTS,
  NO_INPUT,
  ownerOnly,
  READ_HINTS,
  WRITE_HINTS,
} from '../tool-kit';
import { discoverShelly } from './discovery';
import type { ShellyEnrollInput } from './enrollment';
import type { ShellyOutcome, ShellyRequest } from './operate';
import type { ShellyResource } from './resources';
import { appHolder } from './tracking';

const SENSOR = z.string().min(1);
const OWNER_RESOURCES: ReadonlySet<string> = new Set([
  'schedules',
  'webhooks',
  'scripts',
  'storedValues',
]);
const READ_INPUT = z.strictObject({
  externalId: SENSOR.nullable().default(null),
  resource: z
    .enum(['status', 'actions', 'schedules', 'webhooks', 'scripts', 'storedValues'])
    .default('status'),
  action: SHELLY_ACTION.optional(),
});

export interface ShellyToolPorts {
  readonly signal: AbortSignal;
  readonly snapshot: () => ShellySnapshot;
  readonly read: (externalId: string, resource: ShellyResource) => Promise<ShellyDevice>;
  readonly execute: (externalId: string, request: ShellyRequest) => Promise<ShellyOutcome>;
  readonly enroll: (input: ShellyEnrollInput) => Promise<ShellyDevice>;
  readonly forget: (externalId: string) => Promise<void>;
  readonly track: (
    externalId: string,
    holder: string,
    enabled: boolean,
  ) => Promise<{ readonly enabled: boolean }>;
}

function actionRows(sensor: ShellyDevice | undefined): readonly Record<string, unknown>[] {
  const available = new Set(sensor?.features.map((feature) => feature.id));
  return SHELLY_ACTIONS.filter((action) => sensor === undefined || available.has(action)).map(
    (action) => {
      const { title, page, group, owner } = shellyOperation(action);
      return { action, title, page, group, owner };
    },
  );
}

function actionDetail(action: z.output<typeof SHELLY_ACTION>): Record<string, unknown> {
  const { title, method, owner, params } = shellyOperation(action);
  return {
    action,
    title,
    method,
    owner,
    params: z.toJSONSchema(params, { io: 'input', unrepresentable: 'any' }),
  };
}

function readTool(ports: ShellyToolPorts): PluginTool {
  return definePluginTool({
    name: 'read',
    title: 'Read Shelly sensor',
    description:
      'Read Shelly Presence sensors: resource status (default), schedules, webhooks, scripts, storedValues, or actions (list the operations; add action for its exact params).',
    input: READ_INPUT,
    annotations: { ...READ_HINTS, openWorldHint: true },
    humanOnly: false,
    run: (input, caller) =>
      attemptTool(async () => {
        const snapshot = ports.snapshot();
        const device = snapshot.devices.find((entry) => entry.externalId === input.externalId);
        if (input.resource === 'status') return { snapshot, device: device ?? null };
        if (input.resource === 'actions')
          return input.action === undefined
            ? { actions: actionRows(device) }
            : actionDetail(input.action);
        if (OWNER_RESOURCES.has(input.resource) && caller.role !== 'owner')
          throw new ApiError(
            'forbidden',
            'Only the owner can read device schedules, webhooks, scripts and stored values.',
          );
        if (input.externalId === null)
          throw new ApiError('invalid_request', 'Select a sensor to read its on-device resources.');
        return { device: await ports.read(input.externalId, input.resource) };
      }),
  });
}

function operateTool(ports: ShellyToolPorts): PluginTool {
  return definePluginTool({
    name: 'operate',
    title: 'Shelly sensor operation',
    description:
      'Run one operation on a Shelly Presence sensor. Read resource actions (with action) for the exact params. Members can read and make everyday changes; other operations are for the owner.',
    input: SHELLY_ACTION_REQUEST,
    annotations: { ...DANGER_HINTS, openWorldHint: true },
    humanOnly: false,
    run: (input, caller) =>
      attemptTool(async () => {
        if (shellyOperation(input.action).owner && caller.role !== 'owner')
          throw new ApiError('forbidden', 'Only the home owner can run this Shelly operation.');
        return ports.execute(input.externalId, {
          action: input.action,
          params: input.params,
          expectedRevision: input.expectedRevision,
        });
      }),
  });
}

function holderOf(caller: ToolCaller, name: string | undefined): string {
  if (caller.via === 'app' && caller.clientId !== null)
    return appHolder(caller.clientId, caller.profileId, name);
  return [caller.via, caller.clientId ?? caller.chatId ?? '', caller.profileId, name ?? ''].join(
    ':',
  );
}

function trackTool(ports: ShellyToolPorts): PluginTool {
  return definePluginTool({
    name: 'set_live_view',
    title: 'Shelly live tracking',
    description:
      'Start or stop live object tracking for the caller; the sensor keeps tracking while any caller holds it. Give a holder name so one automation does not release another.',
    input: z.strictObject({
      externalId: SENSOR,
      enabled: z.boolean(),
      holder: z.string().min(1).optional(),
    }),
    annotations: WRITE_HINTS,
    humanOnly: false,
    run: (input, caller) =>
      attemptTool(() =>
        ports.track(input.externalId, holderOf(caller, input.holder), input.enabled),
      ),
  });
}

function setupTools(ports: ShellyToolPorts): PluginTool[] {
  return [
    definePluginTool({
      name: 'discover',
      title: 'Find Shelly sensors',
      description: 'Browse local Shelly advertisements for eight seconds; changes nothing.',
      input: NO_INPUT,
      annotations: READ_HINTS,
      humanOnly: false,
      run: (_, caller) =>
        ownerOnly(caller, 'Only the home owner can look for sensors.', () =>
          attemptTool(() => discoverShelly(ports.signal)),
        ),
    }),
    definePluginTool({
      name: 'enroll',
      title: 'Add Shelly sensor',
      description:
        'Add a Shelly Presence sensor by its local address and optional local password and TLS material.',
      input: SHELLY_ENROLL_REQUEST,
      annotations: WRITE_HINTS,
      humanOnly: true,
      run: (input, caller) =>
        ownerOnly(caller, 'Only the home owner can add a sensor.', () =>
          attemptTool(async () => ({ device: await ports.enroll(input) })),
        ),
    }),
    definePluginTool({
      name: 'forget',
      title: 'Remove Shelly sensor',
      description:
        'Remove a sensor and its zones from SmartEverything; the physical sensor is not reset.',
      input: z.strictObject({ externalId: SENSOR }),
      annotations: DANGER_HINTS,
      humanOnly: false,
      run: (input, caller) =>
        ownerOnly(caller, 'Only the home owner can remove a sensor.', () =>
          attemptTool(async () => {
            await ports.forget(input.externalId);
            return { removed: true };
          }),
        ),
    }),
  ];
}

export function shellyTools(ports: ShellyToolPorts): PluginTool[] {
  return [readTool(ports), operateTool(ports), trackTool(ports), ...setupTools(ports)];
}
