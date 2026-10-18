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
import { deviceNames } from './targets';

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

function currentValue(context: Pick<ToolContext, 'store'>, command: CommandRow): JsonValue {
  if (command.device_id === null) {
    return null;
  }
  return context.store.state.value(command.device_id, command.capability) ?? null;
}

export function reported(
  context: Pick<ToolContext, 'store'>,
  outcome: Outcome,
): Record<string, unknown> {
  const names = deviceNames(context.store);
  return {
    commands: outcome.commands.map((command) => ({
      id: command.id,
      device_id: command.device_id,
      device: command.device_id === null ? null : (names.get(command.device_id) ?? null),
      capability: command.capability,
      value: command.value,
      status: command.status,
      result: command.result,
      error: command.error,
      now: currentValue(context, command),
    })),
    allFinished: outcome.allFinished,
  };
}
