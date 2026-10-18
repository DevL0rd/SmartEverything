import {
  CommandRefusedError,
  machineActionOfCapability,
  machineOpenTargetOf,
  type ComputerScope,
  type ComputerScopes,
  type JsonValue,
  type MachineAction,
  type NodeRequest,
} from '@smarteverything/domain';
import { z } from 'zod';

const COMPUTER_MACHINE_ACTIONS = [
  'ring',
  'stop_ring',
  'launch_app',
  'open',
  'unlock',
  'show_unlock',
] as const satisfies readonly MachineAction[];

export type ComputerMachineAction = (typeof COMPUTER_MACHINE_ACTIONS)[number];

export const COMPUTER_MACHINE_SCOPE: Readonly<Record<ComputerMachineAction, ComputerScope>> = {
  ring: 'apps',
  stop_ring: 'apps',
  launch_app: 'apps',
  open: 'apps',
  unlock: 'power',
  show_unlock: 'power',
};

export function offeredMachineActions(
  scopes: ComputerScopes | null,
): readonly ComputerMachineAction[] {
  return scopes === null
    ? []
    : COMPUTER_MACHINE_ACTIONS.filter((action) => scopes[COMPUTER_MACHINE_SCOPE[action]]);
}

export function computerMachineActionOf(capability: string): ComputerMachineAction | null {
  const action = machineActionOfCapability(capability);
  return COMPUTER_MACHINE_ACTIONS.find((known) => known === action) ?? null;
}

function textOf(capability: string, value: JsonValue): string {
  const text = z.string().trim().min(1).safeParse(value);
  if (!text.success) {
    throw new CommandRefusedError(capability, 'it needs a name or link as text');
  }
  return text.data;
}

function openRequest(value: JsonValue): NodeRequest {
  const text = textOf('open', value);
  try {
    return { verb: 'open', target: machineOpenTargetOf(text) };
  } catch (cause) {
    throw new CommandRefusedError('open', cause instanceof Error ? cause.message : String(cause));
  }
}

export function machineRequestOf(action: ComputerMachineAction, value: JsonValue): NodeRequest {
  switch (action) {
    case 'ring':
      return { verb: 'ring', on: true };
    case 'stop_ring':
      return { verb: 'ring', on: false };
    case 'launch_app':
      return { verb: 'open_app', appId: textOf('launch_app', value) };
    case 'open':
      return openRequest(value);
    case 'unlock':
      return { verb: 'unlock' };
    case 'show_unlock':
      return { verb: 'show_unlock' };
  }
}
