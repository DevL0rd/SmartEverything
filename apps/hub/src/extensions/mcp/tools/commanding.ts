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
    current: (id) => context.store.host.call('commands', 'byId', id),
  });
}

export function sendAndWait(
  context: ToolContext,
  commands: readonly CommandRequest[],
): Promise<Outcome> {
  return waitFor(context, 'sendCommands', { body: { commands } });
}

export async function reported(
  context: Pick<ToolContext, 'store'>,
  outcome: Outcome,
): Promise<Record<string, unknown>> {
  return {
    commands: await context.store.host.read('mcpReported', outcome.commands),
    allFinished: outcome.allFinished,
  };
}
