import {
  COMPUTER_ACTIONS,
  MEDIA_STATUSES,
  type AdapterSink,
  type CommandSource,
  type ComputerAction,
  type ComputerScopes,
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
}

export interface ComputerCommandRecords {
  readonly originOf: (commandId: string) => CommandOrigin;
  readonly macsOf: (deviceId: string) => readonly string[];
  readonly wake: WakeOnLan;
}

export interface ComputerCommandContext extends ComputerCommandRecords {
  readonly directory: {
    readonly byExternalId: (externalId: string) => Pick<ComputerSession, 'call'>;
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
  await context.directory.byExternalId(command.externalId).call({ verb: 'power', action });
}

export async function runComputerCommand(
  command: DeviceCommand,
  context: ComputerCommandContext,
): Promise<JsonValue> {
  const media = mediaRequest(command);
  if (media !== null) {
    await context.directory.byExternalId(command.externalId).call(media);
    return null;
  }
  const action = COMPUTER_ACTION.safeParse(command.capability);
  if (!action.success) {
    throw new ComputerCommandUnsupportedError(command.capability);
  }
  const deviceId = context.deviceIdOf(command.externalId);
  if (deviceId === undefined) {
    throw new NotAComputerError();
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
