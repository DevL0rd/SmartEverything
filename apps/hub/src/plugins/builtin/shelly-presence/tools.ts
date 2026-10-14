import { discoverShelly } from './discovery';
import {
  ApiError,
  SHELLY_PRESENCE_ACTION_REQUEST,
  type ShellyPresenceAction,
  type ShellyPresenceDevice,
  type ShellyPresenceOutcome,
  type ShellyPresenceSnapshot,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { ToolCaller } from '../../../ai-tools/hub-tool';
import type { PluginTool } from '../contract';
import { definePluginTool } from '../define';
import { attemptTool, DANGER_HINTS, READ_HINTS, WRITE_HINTS } from '../tool-kit';
import { SHELLY_ENROLL_INPUT } from './enrollment';
import { shellyActionPermission } from './action-rules';
import type { ShellyResource } from './read-resources';
import { shellyActionInput } from './tool-input';

const READ_RESOURCE = z.strictObject({
  externalId: z.string().min(1).max(200).nullable().default(null),
  resource: z
    .enum(['status', 'schedules', 'webhooks', 'scripts', 'storedValues'])
    .default('status'),
});
const READ_INPUT = z
  .strictObject({
    externalId: READ_RESOURCE.shape.externalId.unwrap().optional(),
    resource: READ_RESOURCE.shape.resource.unwrap().optional(),
    operation: shellyActionInput('read').shape.operation.optional(),
  })
  .transform((input, context) => {
    const parsed = z.union([SHELLY_PRESENCE_ACTION_REQUEST, READ_RESOURCE]).safeParse(input);
    if (parsed.success) return parsed.data;
    for (const issue of parsed.error.issues)
      context.addIssue({ code: 'custom', path: issue.path, message: issue.message });
    return z.NEVER;
  });
export interface ShellyToolPorts {
  readonly signal: AbortSignal;
  readonly snapshot: () => ShellyPresenceSnapshot;
  readonly read: (externalId: string, resource: ShellyResource) => Promise<ShellyPresenceDevice>;
  readonly execute: (
    externalId: string,
    action: ShellyPresenceAction,
    caller: ToolCaller,
  ) => Promise<ShellyPresenceOutcome>;
  readonly enroll: (input: z.output<typeof SHELLY_ENROLL_INPUT>) => Promise<ShellyPresenceDevice>;
  readonly forget: (externalId: string) => Promise<void>;
  readonly live: (
    externalId: string,
    holder: string,
    enabled: boolean,
  ) => Promise<{ enabled: boolean; expiresAt: string | null; renewAfterMs: number | null }>;
}
function readTool(ports: ShellyToolPorts): PluginTool {
  return definePluginTool({
    name: 'read',
    title: 'Read Shelly sensor',
    description:
      'Read configured Shelly Presence sensors, settings, on-device resources or a typed read operation.',
    input: READ_INPUT,
    annotations: { ...READ_HINTS, openWorldHint: true },
    humanOnly: false,
    run: (input, caller) =>
      attemptTool(async () => {
        if ('operation' in input) return execute(ports, input, 'read', caller);
        if (
          (input.resource === 'scripts' || input.resource === 'storedValues') &&
          caller.role !== 'owner'
        )
          throw new ApiError(
            'forbidden',
            'Only the owner can read device scripts and stored values.',
          );
        if (input.resource === 'status')
          return {
            snapshot: ports.snapshot(),
            device:
              input.externalId === null
                ? null
                : ports.snapshot().devices.find((device) => device.externalId === input.externalId),
          };
        if (input.externalId === null)
          throw new ApiError(
            'invalid_request',
            'Select a sensor before reading its on-device resources.',
          );
        const device = await ports.read(input.externalId, input.resource);
        return { snapshot: ports.snapshot(), device };
      }),
  });
}
function liveTool(ports: ShellyToolPorts): PluginTool {
  return definePluginTool({
    name: 'set_live_view',
    title: 'Shelly live map viewer',
    description:
      'Open, renew or close a client-bound live map lease; tracking stops renewing after the last viewer.',
    input: z.strictObject({ externalId: z.string().min(1).max(200), enabled: z.boolean() }),
    annotations: WRITE_HINTS,
    humanOnly: false,
    run: (input, caller) =>
      attemptTool(async () => {
        if (caller.clientId === null)
          throw new ApiError('forbidden', 'Live map viewing requires a paired client.');
        return ports.live(
          input.externalId,
          `${caller.clientId}:${caller.profileId}`,
          input.enabled,
        );
      }),
  });
}
export function shellyTools(ports: ShellyToolPorts): PluginTool[] {
  return [readTool(ports), ...operationTools(ports), ...setupTools(ports), liveTool(ports)];
}
function operationTools(ports: ShellyToolPorts): PluginTool[] {
  const groups = [
    { name: 'operate', permission: 'write', hints: WRITE_HINTS },
    { name: 'operate_privileged', permission: 'privileged', hints: WRITE_HINTS },
    { name: 'operate_destructive', permission: 'destructive', hints: DANGER_HINTS },
    { name: 'operate_access', permission: 'access', hints: DANGER_HINTS },
  ] as const;
  return groups.map((group) =>
    definePluginTool({
      name: group.name,
      title: 'Shelly sensor operation',
      description: `Run a typed ${group.permission} operation on one configured Shelly Presence sensor; the actual firmware method and current revision are validated.`,
      input: shellyActionInput(group.permission),
      annotations: { ...group.hints, openWorldHint: true },
      humanOnly: group.permission === 'access',
      run: (input, caller) => attemptTool(() => execute(ports, input, group.permission, caller)),
    }),
  );
}
async function execute(
  ports: ShellyToolPorts,
  input: z.output<typeof SHELLY_PRESENCE_ACTION_REQUEST>,
  permission: ReturnType<typeof shellyActionPermission>,
  caller: ToolCaller,
): Promise<ShellyPresenceOutcome> {
  if (
    ['script_code', 'kvs_get', 'kvs_many'].includes(input.operation.action) &&
    caller.role !== 'owner'
  )
    throw new ApiError(
      'forbidden',
      'Only the owner can read private script source and stored values.',
    );
  if (shellyActionPermission(input.operation) !== permission)
    throw new ApiError(
      'forbidden',
      'Use the operation tool matching this action permission category.',
    );
  if (permission !== 'read' && permission !== 'write' && caller.role !== 'owner')
    throw new ApiError('forbidden', 'Only the home owner can run privileged Shelly operations.');
  if (permission === 'access' && (caller.via !== 'app' || caller.pluginRequester !== undefined))
    throw new ApiError('forbidden', 'Access-granting operations require a person in the app.');
  return ports.execute(input.externalId, input.operation, caller);
}
function setupTools(ports: ShellyToolPorts): PluginTool[] {
  return [
    definePluginTool({
      name: 'discover',
      title: 'Find configured Shelly sensors',
      description:
        'Browse local Shelly advertisements for eight seconds on explicit request, without scanning addresses or changing devices.',
      input: z.strictObject({}),
      annotations: READ_HINTS,
      humanOnly: true,
      run: (_, caller) =>
        attemptTool(() => {
          requireOwnerApp(caller);
          return discoverShelly(ports.signal);
        }),
    }),
    definePluginTool({
      name: 'enroll',
      title: 'Add configured Shelly sensor',
      description:
        'Enroll a Wi-Fi-configured Shelly Presence by its local address and optional local password; no cloud account is required.',
      input: SHELLY_ENROLL_INPUT,
      annotations: WRITE_HINTS,
      humanOnly: true,
      run: (input, caller) =>
        attemptTool(async () => {
          requireOwnerApp(caller);
          return { device: await ports.enroll(input) };
        }),
    }),
    definePluginTool({
      name: 'forget',
      title: 'Remove Shelly sensor',
      description:
        'Remove this sensor and its zone targets from SmartEverything without resetting the physical sensor.',
      input: z.strictObject({ externalId: z.string().min(1).max(200) }),
      annotations: DANGER_HINTS,
      humanOnly: false,
      run: (input, caller) =>
        attemptTool(async () => {
          if (caller.role !== 'owner')
            throw new ApiError('forbidden', 'Only the home owner can remove a sensor.');
          await ports.forget(input.externalId);
          return { removed: true };
        }),
    }),
  ];
}
function requireOwnerApp(caller: ToolCaller): void {
  if (caller.role !== 'owner' || caller.via !== 'app' || caller.pluginRequester !== undefined)
    throw new ApiError('forbidden', 'Adding a configured sensor requires the owner in the app.');
}
