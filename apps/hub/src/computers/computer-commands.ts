import {
  ApiError,
  COMPUTER_ACTIONS,
  CommandRefusedError,
  HUB_GUARD_MESSAGE,
  MACHINE_ACTION_RISK,
  MEDIA_STATUSES,
  computerGuardBlocks,
  machineActionRefusal,
  type AdapterSink,
  type CommandSource,
  type ComputerAction,
  type ComputerScopes,
  type MachineAction,
  type PhoneApproval,
  type DeviceCommand,
  type JsonValue,
  type NodeRequest,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { WakeOnLan } from '../network/wake-on-lan';
import {
  ComputerCommandUnsupportedError,
  ComputerScopeOffError,
  NotAComputerError,
} from './computer-errors';
import type { ComputerSession } from './computer-session';
import {
  COMPUTER_MACHINE_SCOPE,
  computerMachineActionOf,
  machineRequestOf,
  type ComputerMachineAction,
} from './machine-requests';

const COMPUTER_ACTION = z.enum(COMPUTER_ACTIONS);

const MEDIA_COMMAND = z.discriminatedUnion('capability', [
  z.object({ capability: z.literal('volume'), value: z.number().min(0).max(100) }),
  z.object({ capability: z.literal('mute'), value: z.boolean() }),
  z.object({ capability: z.literal('playback'), value: z.enum(MEDIA_STATUSES) }),
]);

function mediaRequest(command: DeviceCommand): NodeRequest | null {
  const media = MEDIA_COMMAND.safeParse(command);
  if (!media.success) {
    return null;
  }
  switch (media.data.capability) {
    case 'volume':
      return { verb: 'volume', level: media.data.value };
    case 'mute':
      return { verb: 'mute', muted: media.data.value };
    case 'playback':
      return { verb: 'playback', status: media.data.value };
  }
}

export interface CommandOrigin {
  readonly source: CommandSource;
  readonly client: string | null;
  readonly clientId: string | null;
}

export interface ComputerCommandRecords {
  readonly originOf: (commandId: string) => CommandOrigin;
  readonly visibleTo: (deviceId: string, clientId: string) => boolean;
  readonly macsOf: (deviceId: string) => readonly string[];
  readonly wake: WakeOnLan;
  readonly approve: (
    deviceId: string,
    action: MachineAction,
    source: PhoneApproval['source'],
  ) => Promise<void>;
}

export interface ComputerCommandContext extends ComputerCommandRecords {
  readonly directory: {
    readonly byExternalId: (
      externalId: string,
    ) => Pick<ComputerSession, 'call' | 'role' | 'machineActions'>;
  };
  readonly deviceIdOf: (externalId: string) => string | undefined;
  readonly scopesOf: (deviceId: string) => ComputerScopes;
  readonly sink: AdapterSink;
  readonly now: () => Date;
}

function permit(scopes: ComputerScopes, origin: CommandOrigin): void {
  if (!scopes.power) {
    throw new ComputerScopeOffError('power');
  }
  if (origin.source === 'assistant' && !scopes.ai_power) {
    throw new ComputerScopeOffError('ai_power');
  }
}

function requireScope(
  scopes: ComputerScopes,
  action: ComputerMachineAction,
  origin: CommandOrigin,
): void {
  const scope = COMPUTER_MACHINE_SCOPE[action];
  if (scope === 'power') {
    permit(scopes, origin);
  } else if (!scopes[scope]) {
    throw new ComputerScopeOffError(scope);
  }
}

async function runMachineAction(
  action: ComputerMachineAction,
  deviceId: string,
  command: DeviceCommand,
  context: ComputerCommandContext,
): Promise<void> {
  const origin = context.originOf(command.commandId);
  const request = machineRequestOf(action, command.value);
  requireScope(context.scopesOf(deviceId), action, origin);
  const session = context.directory.byExternalId(command.externalId);
  const refusal = machineActionRefusal(session.machineActions(), action);
  if (refusal !== null) {
    throw new CommandRefusedError(command.capability, refusal);
  }
  if (MACHINE_ACTION_RISK[action] === 'confirm' && origin.source !== 'app') {
    await context.approve(deviceId, action, origin.source);
  }
  await session.call(request);
  context.sink.event({
    externalId: command.externalId,
    kind: 'machine_action',
    occurredAt: context.now().toISOString(),
    details: { action, source: origin.source, client: origin.client },
  });
}

async function perform(
  action: ComputerAction,
  deviceId: string,
  command: DeviceCommand,
  context: ComputerCommandContext,
): Promise<void> {
  if (action === 'wake') {
    await Promise.all(context.macsOf(deviceId).map((mac) => context.wake(mac)));
    return;
  }
  const session = context.directory.byExternalId(command.externalId);
  const explicit = context.originOf(command.commandId).source === 'app';
  if (computerGuardBlocks(session.role, { kind: 'power', action }, explicit)) {
    throw new ApiError('conflict', HUB_GUARD_MESSAGE);
  }
  await session.call({ verb: 'power', action });
}

function deviceOf(command: DeviceCommand, context: ComputerCommandContext): string {
  const deviceId = context.deviceIdOf(command.externalId);
  const { clientId } = context.originOf(command.commandId);
  if (deviceId === undefined || (clientId !== null && !context.visibleTo(deviceId, clientId))) {
    throw new NotAComputerError();
  }
  return deviceId;
}

export async function runComputerCommand(
  command: DeviceCommand,
  context: ComputerCommandContext,
): Promise<JsonValue> {
  const deviceId = deviceOf(command, context);
  const machine = computerMachineActionOf(command.capability);
  if (machine !== null) {
    await runMachineAction(machine, deviceId, command, context);
    return null;
  }
  const media = mediaRequest(command);
  if (media !== null) {
    await context.directory.byExternalId(command.externalId).call(media);
    return null;
  }
  const action = COMPUTER_ACTION.safeParse(command.capability);
  if (!action.success) {
    throw new ComputerCommandUnsupportedError(command.capability);
  }
  const origin = context.originOf(command.commandId);
  permit(context.scopesOf(deviceId), origin);
  context.sink.event({
    externalId: command.externalId,
    kind: 'computer_power',
    occurredAt: context.now().toISOString(),
    details: { action: action.data, source: origin.source, client: origin.client },
  });
  await perform(action.data, deviceId, command, context);
  return null;
}
