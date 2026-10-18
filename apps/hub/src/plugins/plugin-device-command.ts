import {
  ApiError,
  CAPABILITY_KEY,
  isFinished,
  validateCommand,
  type CommandRow,
  type JsonValue,
} from '@smarteverything/domain';
import type { DeviceDriver } from '../local/device-driver';
import type { BuiltinContextOptions, BuiltinSession } from './builtin-context';
import type { DriverServices } from './driver-services';
import type { PluginHostContext } from './builtin/contract';
export type CommandPortOptions = Pick<BuiltinContextOptions, 'store' | 'submit' | 'now'> & {
  readonly drivers: Pick<DriverServices, 'deviceIdOf'>;
};
export type CommandPortSession = Pick<BuiltinSession, 'signal'>;
interface CommandPorts {
  readonly command: PluginHostContext['devices']['command'];
  readonly withTransientValues: (driver: DeviceDriver) => DeviceDriver;
}
export function commandPorts(
  options: CommandPortOptions,
  session: CommandPortSession,
  owned: ReadonlySet<string>,
): CommandPorts {
  const transient = new Map<string, JsonValue>();
  const submitted = new Set<string>();
  return {
    withTransientValues: (driver) => ({
      ...driver,
      execute: (command) =>
        driver.execute(
          { ...command, value: transient.get(command.commandId) ?? command.value },
          submitted.has(command.commandId),
        ),
    }),
    command: async (input, caller): Promise<JsonValue> => {
      const { externalId, capability: rawCapability, value } = input;
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
      submitted.add(row.id);
      if (input.transient === true) transient.set(row.id, checked);
      try {
        return await commandResult(options, session, row);
      } finally {
        submitted.delete(row.id);
        transient.delete(row.id);
      }
    },
  };
}
function commandResult(
  options: CommandPortOptions,
  session: CommandPortSession,
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
    const timer = setTimeout(
      () => {
        cleanup();
        reject(
          new ApiError(
            'upstream_failed',
            'The queued command did not finish before its expiry; check command history.',
          ),
        );
      },
      Math.max(0, Date.parse(row.expires_at) - options.now().getTime()),
    );
    timer.unref();
    unsubscribe = options.store.feed.subscribe((change) => {
      if (change.table === 'commands' && change.record?.id === row.id) finish(change.record);
    });
    session.signal.addEventListener('abort', aborted, { once: true });
    if (session.signal.aborted) aborted();
    else finish(options.store.commands.byId(row.id));
  });
}
