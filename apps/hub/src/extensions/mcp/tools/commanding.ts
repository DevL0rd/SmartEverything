import {
  API_ENDPOINTS as E,
  type CommandRow,
  type EndpointName,
  type JsonValue,
} from '@smarteverything/domain';
import { submitAndWait, type Outcome } from '../command-waiter';
import { operate } from './acting';
import type { OperationInput } from '../../../server/operations';
import type { ToolContext } from './registry';
import { nameOf } from './targets';

export interface CommandRequest {
  readonly device_id: string | null;
  readonly capability: string;
  readonly value: JsonValue;
}

const COMMAND_ROWS = E.sendCommands.response;

export function waitFor(
  context: ToolContext,
  name: EndpointName,
  input: OperationInput,
): Promise<Outcome> {
  return submitAndWait({
    feed: context.store.feed,
    clock: context.clock,
    waitMs: context.commandWaitMs,
    submit: async (): Promise<readonly CommandRow[]> =>
      COMMAND_ROWS.parse(await operate(context, name, input)),
    current: (id) => context.store.commands.byId(id),
  });
}

export function sendAndWait(
  context: ToolContext,
  commands: readonly CommandRequest[],
): Promise<Outcome> {
  return waitFor(context, 'sendCommands', { body: { commands } });
}

function deviceName(context: ToolContext, deviceId: string | null): string | null {
  if (deviceId === null) {
    return null;
  }
  const device = context.store.devices.find(deviceId);
  return device === undefined ? null : nameOf(context.store, device);
}

function nowValues(context: ToolContext): Map<string, JsonValue> {
  return new Map(
    context.store.state.list().map((row) => [`${row.device_id}/${row.capability}`, row.value]),
  );
}

export function reported(context: ToolContext, outcome: Outcome): Record<string, unknown> {
  const now = nowValues(context);
  return {
    commands: outcome.commands.map((command) => ({
      id: command.id,
      device_id: command.device_id,
      device: deviceName(context, command.device_id),
      capability: command.capability,
      value: command.value,
      status: command.status,
      result: command.result,
      error: command.error,
      now: now.get(`${command.device_id ?? ''}/${command.capability}`) ?? null,
    })),
    allFinished: outcome.allFinished,
  };
}
