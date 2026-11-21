import { executionRole, currentExecutionAuthority } from '../assistant/turn-authority';
import { roleOfCaller, clientOf, profileIdOf } from './auth';
import { deviceReachWhy } from './person-scope';
import { refusal } from './person-access';
import type { COMMAND_INPUT, DeviceScope } from '@smarteverything/domain';
import { CommandRefusedError, InvalidValueError } from '@smarteverything/domain';
import type { z } from 'zod';
import type { NewCommand } from '../store/repositories/commands';
import type { Store } from '../store/store';
import type { Caller } from './auth';

export type CheckedInput = Omit<z.output<typeof COMMAND_INPUT>, 'source'> & {
  readonly source: NewCommand['source'];
};

export interface CommandPrincipal {
  readonly clientId: string | null;
  readonly role: 'owner' | 'member';
  readonly profileId: string;
  readonly devices: DeviceScope | null;
}

export function commandRole(caller: Caller): CommandPrincipal['role'] {
  const authority = caller.kind === 'service' ? undefined : currentExecutionAuthority();
  const member = authority !== undefined && executionRole(authority) === 'member';
  return member ? 'member' : roleOfCaller(caller);
}

export async function commandPrincipal(
  store: Pick<Store, 'host'>,
  caller: Caller,
): Promise<CommandPrincipal> {
  const role = commandRole(caller);
  const profileId = profileIdOf(caller);
  return {
    clientId: caller.kind === 'service' ? null : clientOf(caller).id,
    role,
    profileId,
    devices: role === 'owner' ? null : await store.host.read('deviceScope', profileId),
  };
}

export interface CommandsCheck {
  readonly inputs: readonly CheckedInput[];
  readonly principal: CommandPrincipal;
}

export async function checkedCommands(
  store: Pick<Store, 'host'>,
  inputs: readonly CheckedInput[],
  principal: CommandPrincipal,
): Promise<NewCommand[]> {
  const checked = await store.host.read('checkCommands', { inputs, principal });
  if (checked.kind === 'checked') return checked.commands;
  if (checked.kind === 'refused') throw new CommandRefusedError(checked.capability, checked.reason);
  if (checked.kind === 'invalid')
    throw new InvalidValueError(checked.descriptor, checked.received, checked.reason);
  throw refusal(
    store,
    { id: principal.clientId, profile_id: principal.profileId },
    deviceReachWhy(checked.deviceId),
  );
}

export function sourcedBy(caller: Caller, inputs: readonly CheckedInput[]): CheckedInput[] {
  const authority = caller.kind === 'service' ? caller.authority : currentExecutionAuthority();
  const assistant =
    caller.kind === 'service' || (caller.kind === 'client' && caller.via === 'assistant');
  return inputs.map((input) =>
    assistant && (authority !== undefined || input.source === 'app')
      ? { ...input, source: 'assistant' }
      : input,
  );
}
