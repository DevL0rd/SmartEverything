import { ApiError } from '@smarteverything/domain';
import {
  currentExecutionAuthorities,
  validateExecutionAuthority,
} from '../assistant/execution-authority';
import type { ConversationAuthority } from '../harness/authority-contract';
import type { Store } from '../store/store';
interface PluginCall {
  readonly authorities: readonly ConversationAuthority[];
  active: number;
}
const calls = new WeakMap<Store, Map<string, PluginCall>>();
export function resetPluginCallAuthority(store: Store, plugin: string): void {
  calls.get(store)?.delete(plugin);
}
export function pluginCallAuthority(
  store: Store,
  plugin: string,
): ConversationAuthority | undefined {
  const call = calls.get(store)?.get(plugin);
  if (call === undefined) return undefined;
  if (call.active === 0)
    throw new ApiError('forbidden', 'This plugin callback belongs to a completed scoped call.');
  for (const authority of call.authorities) validateExecutionAuthority(store, authority);
  return call.authorities[0];
}
export async function withPluginCallAuthority<T>(
  store: Store,
  plugin: string,
  authority: ConversationAuthority,
  work: () => Promise<T>,
): Promise<T> {
  const authorities = [
    ...new Map(
      [authority, ...currentExecutionAuthorities()].map(
        (source) => [source.event_id, source] as const,
      ),
    ).values(),
  ];
  for (const source of authorities) validateExecutionAuthority(store, source);
  const scopes = calls.get(store) ?? new Map<string, PluginCall>();
  calls.set(store, scopes);
  const previous = scopes.get(plugin);
  if (
    previous !== undefined &&
    previous.active > 0 &&
    JSON.stringify(previous.authorities) !== JSON.stringify(authorities)
  )
    throw new ApiError('conflict', 'Concurrent plugin calls have ambiguous initiating grants.');
  const call =
    previous !== undefined && previous.active > 0 ? previous : { authorities, active: 0 };
  scopes.set(plugin, call);
  call.active++;
  try {
    return await work();
  } finally {
    call.active--;
  }
}

export function pluginCallAuthorities(
  store: Store,
  plugin: string,
): readonly ConversationAuthority[] {
  pluginCallAuthority(store, plugin);
  return calls.get(store)?.get(plugin)?.authorities ?? [];
}
