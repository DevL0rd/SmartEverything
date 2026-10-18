import { ApiError } from '@smarteverything/domain';
import type { ConversationAuthority } from '../harness/authority-contract';
import type { Store } from '../store/store';
interface PluginCall {
  readonly authority: ConversationAuthority;
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
  return calls.get(store)?.get(plugin)?.authority;
}
export async function withPluginCallAuthority<T>(
  store: Store,
  plugin: string,
  authority: ConversationAuthority,
  work: () => Promise<T>,
): Promise<T> {
  if (store.plugins.byId(plugin).source === 'builtin') return work();
  const scopes = calls.get(store) ?? new Map<string, PluginCall>();
  calls.set(store, scopes);
  const previous = scopes.get(plugin);
  if (previous !== undefined && previous.authority.event_id !== authority.event_id)
    throw new ApiError(
      'conflict',
      'This plugin is already serving another request; try again when it finishes.',
    );
  const call = previous ?? { authority, active: 0 };
  scopes.set(plugin, call);
  call.active++;
  try {
    return await work();
  } finally {
    call.active--;
    if (call.active === 0 && scopes.get(plugin) === call) scopes.delete(plugin);
  }
}
