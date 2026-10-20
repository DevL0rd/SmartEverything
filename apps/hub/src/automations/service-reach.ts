import {
  ApiError,
  NODE_REGISTRY,
  targetCapability,
  programNodes,
  signalTriggerError,
  type AutomationAuthor,
  type AutomationV3,
  type DeviceRow,
  type FlowNode,
  type JsonValue,
  type PluginOrigin,
} from '@smarteverything/domain';
import type { Manifest } from '@smarteverything/flow/compile/manifest';
import { pluginOriginOf } from '../ai-tools/plugin-turn';
import type { ToolHub } from '../ai-tools/tool-hub';
import { hiddenComputer, viewerOf } from '../computers/computer-access';
import { resolveTarget } from '../device-groups/commands';
import { assertPhoneCommandAllowed } from '../phones/phone-access';
import { profileIdOf, roleOfCaller, type Caller } from '../server/auth';
import { commandRole } from '../server/commands';
import { assertDevicesReach } from '../server/person-scope';
import { installedSignalSources } from '../signals/sources/installed';
import type { Store } from '../store/store';

const SIGNAL_KIND = 'trigger.signal';
const TOOL_KIND = 'tool.call';

function literalOf(node: Pick<FlowNode, 'ports'>, port: string): JsonValue | undefined {
  const value = node.ports?.[port];
  return value !== undefined && 'lit' in value ? value.lit : undefined;
}

function isMatch(value: JsonValue | undefined): value is Readonly<Record<string, JsonValue>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function requireOwnerForManifest(caller: Caller, manifest: Manifest): void {
  if ((manifest.owner || manifest.ai) && roleOfCaller(caller) !== 'owner') {
    throw new ApiError(
      'forbidden',
      'Only an owner can save automations that wake the AI or use tools.',
    );
  }
}

export function requireOwnerForTriggers(caller: Caller, program: AutomationV3): void {
  if (roleOfCaller(caller) === 'owner') return;
  const [owned] = program.triggers.flatMap((trigger) => {
    const kind = NODE_REGISTRY.get(trigger.kind);
    return kind?.access === 'owner' ? [kind.name] : [];
  });
  if (owned !== undefined) {
    throw new ApiError('forbidden', `Only an owner can start an automation from: ${owned}.`);
  }
}

export function requireVisibleComputers(store: Store, caller: Caller, manifest: Manifest): void {
  const viewer = viewerOf(store, caller);
  for (const id of manifest.uses.computer) {
    const device = store.devices.find(id);
    if (device !== undefined && hiddenComputer(store, viewer, device)) {
      throw new ApiError('forbidden', 'A member can only automate their own computers.');
    }
  }
}

function reachedDevices(store: Store, uses: Manifest['uses']): readonly DeviceRow[] {
  const direct = [...uses.device, ...uses.camera, ...uses.phone].flatMap(
    (id) => store.devices.find(id) ?? [],
  );
  const rooms = uses.room.flatMap((roomId) => resolveTarget(store, { kind: 'room', roomId }));
  const groups = uses.group.flatMap((groupId) => resolveTarget(store, { kind: 'group', groupId }));
  return [
    ...new Map([...direct, ...rooms, ...groups].map((device) => [device.id, device])).values(),
  ];
}

function requirePhoneAccess(
  store: Store,
  caller: Caller,
  devices: readonly DeviceRow[],
  controls: readonly string[],
): void {
  const viewer = { role: commandRole(caller), profileId: profileIdOf(store, caller) };
  for (const device of devices.filter((candidate) => candidate.kind === 'phone')) {
    for (const control of controls) {
      const presented = targetCapability(device, control);
      if (presented !== undefined) assertPhoneCommandAllowed(device, presented.key, viewer);
    }
  }
}

export function requireReachableTargets(store: Store, caller: Caller, manifest: Manifest): void {
  const devices = reachedDevices(store, manifest.uses);
  assertDevicesReach(
    store,
    caller,
    devices.map((device) => device.id),
  );
  requirePhoneAccess(store, caller, devices, manifest.uses.control);
}

export function requireKnownSignals(store: Store, program: AutomationV3): void {
  const sources = installedSignalSources(store);
  for (const trigger of program.triggers) {
    const source = literalOf(trigger, 'source');
    const kind = literalOf(trigger, 'kind');
    if (trigger.kind !== SIGNAL_KIND || typeof source !== 'string' || typeof kind !== 'string') {
      continue;
    }
    const match = literalOf(trigger, 'match');
    const error = signalTriggerError(sources, {
      source,
      kind,
      match: isMatch(match) ? match : {},
    });
    if (error !== null) throw new ApiError('invalid_request', `${error.name}: ${error.message}`);
  }
}

export function authorOf(store: Store, caller: Caller): AutomationAuthor {
  const assistant =
    caller.kind === 'service' || (caller.kind === 'client' && caller.via === 'assistant');
  return { via: assistant ? 'assistant' : 'person', profile_id: profileIdOf(store, caller) };
}

export function originOf(
  tools: Pick<ToolHub, 'pluginTurnRefusal'>,
  caller: Caller,
  program: AutomationV3,
): PluginOrigin | null {
  const plugin = caller.kind === 'client' ? pluginOriginOf(caller) : null;
  if (plugin === null) return null;
  for (const node of programNodes(program).filter((candidate) => candidate.kind === TOOL_KIND)) {
    const name = literalOf(node, 'tool');
    const args = literalOf(node, 'args');
    const refusal =
      typeof name === 'string' ? tools.pluginTurnRefusal(name, isMatch(args) ? args : {}) : null;
    if (refusal !== null) throw refusal;
  }
  return plugin;
}
