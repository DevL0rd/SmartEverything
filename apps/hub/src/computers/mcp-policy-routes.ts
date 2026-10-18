import { API_ENDPOINTS as E, type ComputerRuntimeTarget } from '@smarteverything/domain';
import type { Store } from '../store/store';
import { bound, type Routes } from '../server/router';
import type { ComputerAiDirectory } from './ai-directory';

export function computerMcpPolicyRoutes(
  directory: ComputerAiDirectory,
  store: Store,
): Routes<'readComputerNativeMcpPolicy' | 'updateComputerNativeMcpPolicy'> {
  const target = (params: {
    readonly deviceId: string;
    readonly runtime: 'claude' | 'codex';
  }): ComputerRuntimeTarget => {
    const value = { device_id: params.deviceId, runtime: params.runtime };
    directory.runtimeStatus(value);
    return value;
  };
  return {
    readComputerNativeMcpPolicy: bound(E.readComputerNativeMcpPolicy, ({ params }) =>
      store.computerNativeMcpPolicy.read(target(params)),
    ),
    updateComputerNativeMcpPolicy: bound(E.updateComputerNativeMcpPolicy, ({ params, body }) => {
      const value = target(params);
      const policy = store.computerNativeMcpPolicy.save(value, body);
      if (value.runtime === 'claude') directory.changed(value.device_id);
      else directory.runtimes.changed(value);
      return policy;
    }),
  };
}
