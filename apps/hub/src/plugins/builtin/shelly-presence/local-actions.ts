import type { JsonValue, ShellyPresenceAction } from '@smarteverything/domain';
import { readScriptLibrary } from './script-library';
export async function localShellyAction(
  action: ShellyPresenceAction,
  ports: {
    readonly signal: AbortSignal;
    readonly refresh: () => Promise<void>;
    readonly reconnect: () => Promise<void>;
  },
): Promise<JsonValue | undefined> {
  if (action.action === 'refresh') {
    await ports.refresh();
    return null;
  }
  if (action.action === 'reconnect') {
    await ports.reconnect();
    return null;
  }
  return readScriptLibrary(action, ports.signal);
}
