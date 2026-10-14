import {
  ApiError,
  CAPABILITY_KEY,
  isFinished,
  validateCommand,
  type CommandRow,
  type JsonValue,
} from '@smarteverything/domain';
import { needsOwnDevice, type ToolCaller } from '../ai-tools/hub-tool';
import {
  currentExecutionAuthorities,
  executionRole,
  validateExecutionAuthority,
} from '../assistant/execution-authority';
import type { BuiltinContextOptions, BuiltinSession } from './builtin-context';
import type { PluginHostContext } from './builtin/contract';
export function commandPorts(
  options: BuiltinContextOptions,
  session: BuiltinSession,
  owned: ReadonlySet<string>,
): Pick<PluginHostContext['devices'], 'command' | 'callerOf' | 'valueOf'> {
  const callers = new Map<string, ToolCaller>();
  const inputs = new Map<string, JsonValue>();
  return {
    callerOf: (id) => callers.get(id) ?? null,
    valueOf: (id) => inputs.get(id),
    command: async (input, caller): Promise<JsonValue> => {
      const { externalId, capability: rawCapability, value } = input;
      if (caller.authority !== undefined)
        validateExecutionAuthority(options.store, caller.authority);
      if (needsOwnDevice(caller))
        throw new ApiError('forbidden', 'This operation requires its initiating device.');
      if (![...owned].some((id) => externalId.startsWith(`${id}:`)))
        throw new ApiError('forbidden', 'A plugin can command only its registered devices.');
      const deviceId = options.drivers.deviceIdOf(externalId);
      if (deviceId === undefined)
        throw new ApiError('not_found', 'The device inventory is not ready.');
      const capability = CAPABILITY_KEY.parse(rawCapability);
      const device = options.store.devices.byId(deviceId);
      const checked = validateCommand(device, { capability, value });
      const [row] = options.submit([
        {
          deviceId,
          capability,
          value: input.transient === true ? { action: 'sensitive_operation' } : checked,
          source: caller.via === 'app' ? 'app' : 'assistant',
          requestedBy: caller.clientId,
        },
      ]);
      if (row === undefined)
        throw new ApiError('upstream_failed', 'Submitting the operation returned no command.');
      const member = currentExecutionAuthorities().some(
        (authority) => executionRole(options.store, authority) === 'member',
      );
      callers.set(row.id, member ? { ...caller, role: 'member' } : caller);
      inputs.set(row.id, checked);
      try {
        return await commandResult(options, session, row);
      } finally {
        callers.delete(row.id);
        inputs.delete(row.id);
      }
    },
  };
}
function commandResult(
  options: BuiltinContextOptions,
  session: BuiltinSession,
  row: CommandRow,
): Promise<JsonValue> {
  return new Promise((resolve, reject) => {
    let unsubscribe: () => void = () => undefined;
    const cleanup = (): void => {
      clearTimeout(timer);
      unsubscribe();
      session.signal.removeEventListener('abort', aborted);
    };
    const finish = (result: CommandRow): void => {
      if (!isFinished(result.status)) return;
      cleanup();
      if (result.status === 'succeeded') resolve(result.result);
      else reject(new ApiError('upstream_failed', result.error ?? 'The queued operation expired.'));
    };
    const aborted = (): void => {
      cleanup();
      reject(new ApiError('conflict', 'The plugin stopped while its queued command was running.'));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new ApiError(
          'upstream_failed',
          'The queued command did not finish before its expiry; check command history.',
        ),
      );
    }, 120000);
    timer.unref();
    unsubscribe = options.store.feed.subscribe((change) => {
      if (change.table === 'commands' && change.record?.id === row.id) finish(change.record);
    });
    session.signal.addEventListener('abort', aborted, { once: true });
    if (session.signal.aborted) aborted();
    else finish(options.store.commands.byId(row.id));
  });
}
