import { hubCommandRequiresOwner } from '../server/commands';
import { ApiError } from '@smarteverything/domain';
import {
  admitExecutionDevice,
  executionRole,
  validateExecutionAuthority,
  currentExecutionAuthorities,
  withExecutionAuthorities,
  admitExecutionTool,
} from '../assistant/execution-authority';
import type { ConversationAuthority } from './authority-contract';
import type { Store } from '../store/store';
import type { EffectKind } from '../store/repositories/harness-effects';
export function effectAuthorities(
  store: Store,
  kind: EffectKind,
  id: string,
): readonly ConversationAuthority[] {
  const effect = store.harnessRecovery.effects.find(kind, id);
  if (effect === undefined) return [];
  const authorities = effect.authorities.map((event) => {
    const authority = store.harnessRecovery.authority(event);
    if (authority?.profile_id !== effect.profile_id)
      throw new ApiError(
        'forbidden',
        kind === 'automation'
          ? 'This automation’s permission record was removed. An owner must open it and save its actions again before it can run.'
          : 'This saved action’s permission record was removed. An owner must create it again before it can run.',
      );
    validateExecutionAuthority(store, authority);
    return authority;
  });
  return authorities.toSorted(
    (left, right) =>
      Number(executionRole(store, left) === 'owner') -
      Number(executionRole(store, right) === 'owner'),
  );
}
export function withEffectTool<T>(
  store: Store,
  authorities: readonly ConversationAuthority[],
  input: { readonly name: string; readonly args: Readonly<Record<string, unknown>> },
  work: () => T,
): T {
  const sources = [
    ...new Map(
      [...authorities, ...currentExecutionAuthorities()].map(
        (authority) => [authority.event_id, authority] as const,
      ),
    ).values(),
  ];
  for (const authority of sources) admitExecutionTool(store, input.name, input.args, authority);
  return withExecutionAuthorities(sources, work);
}

export function admitEffectCommand(store: Store, id: string): void {
  const command = store.commands.byId(id);
  for (const authority of effectAuthorities(store, 'command', id)) {
    if (hubCommandRequiresOwner(command.capability) && executionRole(store, authority) !== 'owner')
      throw new ApiError(
        'forbidden',
        'Queued initiating authority no longer grants owner-only commands.',
      );
    if (command.device_id !== null) admitExecutionDevice(store, command.device_id, authority);
  }
}

export function withEffectAuthority<T>(
  store: Store,
  kind: EffectKind,
  id: string,
  work: () => T,
): T {
  const sources = [
    ...new Map(
      [...effectAuthorities(store, kind, id), ...currentExecutionAuthorities()].map(
        (source) => [source.event_id, source] as const,
      ),
    ).values(),
  ];
  for (const source of sources) validateExecutionAuthority(store, source);
  return withExecutionAuthorities(sources, work);
}
