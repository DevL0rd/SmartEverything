import type { DeviceEffects } from './effects';
import { CommandLanes } from './lanes';
import {
  CAPABILITY_KEY,
  HUB_COMMAND,
  isHubCapability,
  validateCommand,
  type HubCommand,
  type JsonValue,
  type Provider,
  type ProviderAdapter,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { CommandOutcome, CommandRow, HubDatabase } from '../database/port';
import type { DeviceDriverRegistry } from '../local/device-driver';
import type { Inventory } from '../state/inventory';

export interface AdapterDirectory {
  readonly adapterFor: (provider: Provider) => ProviderAdapter | undefined;
}

export interface CommandExecutorOptions {
  readonly store: Pick<HubDatabase, 'pendingCommands' | 'claimCommand' | 'finishCommand'>;
  readonly inventory: Pick<Inventory, 'deviceById'>;
  readonly adapters: AdapterDirectory;
  readonly drivers: Pick<DeviceDriverRegistry, 'forDevice'>;
  readonly hubCommand: (command: HubCommand) => Promise<JsonValue>;
  readonly log: Logger;
  readonly now: () => Date;
  readonly effects?: DeviceEffects;
}

class CommandTargetError extends Error {
  override readonly name = 'CommandTargetError';

  constructor(commandId: string, reason: string) {
    super(`Command ${commandId} cannot run: ${reason}.`);
  }
}

export class ProviderNotRunningError extends Error {
  override readonly name = 'ProviderNotRunningError';

  constructor(provider: Provider) {
    super(`The ${provider} provider is not linked or not running on this hub.`);
  }
}

export function describeError(cause: unknown): string {
  return cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
}

export class CommandExecutor {
  private readonly lanes = new CommandLanes();
  private readonly admissions = new CommandLanes();
  private readonly intended = new Map<
    string,
    { readonly value: JsonValue; readonly completedAt: number; readonly expiresAt: number }
  >();
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(private readonly options: CommandExecutorOptions) {}

  async catchUp(): Promise<number> {
    const rows = await this.options.store.pendingCommands();
    for (const row of rows) {
      void this.run(row);
    }
    return rows.length;
  }

  async settled(): Promise<void> {
    await Promise.all(this.inFlight.values());
  }

  run(row: CommandRow, admitted = false, authorize?: () => void): Promise<void> {
    const running = this.inFlight.get(row.id);
    if (running !== undefined) {
      return running;
    }
    const dispatch = (): Promise<void> =>
      this.lanes.run(JSON.stringify([row.device_id, row.capability]), () =>
        this.authorizedExecute(row, authorize),
      );
    const execution = admitted
      ? dispatch()
      : this.admissions.run(JSON.stringify([row.device_id, row.capability]), dispatch);
    const work = execution.finally(() => {
      this.inFlight.delete(row.id);
    });
    this.inFlight.set(row.id, work);
    return work;
  }

  admit<T>(deviceId: string | null, capability: string, work: () => Promise<T>): Promise<T> {
    const key = JSON.stringify([deviceId, capability]);
    return this.admissions.run(key, async () => {
      await this.lanes.run(key, () => Promise.resolve());
      return work();
    });
  }
  intendedValue(deviceId: string, capability: string, observedAt?: string): JsonValue | undefined {
    const key = JSON.stringify([deviceId, capability]);
    const intended = this.intended.get(key);
    if (intended === undefined) return undefined;
    if (
      this.options.now().getTime() >= intended.expiresAt ||
      (observedAt !== undefined && Date.parse(observedAt) > intended.completedAt)
    ) {
      this.intended.delete(key);
      return undefined;
    }
    return intended.value;
  }

  private async authorizedExecute(
    row: CommandRow,
    authorize: (() => void) | undefined,
  ): Promise<void> {
    try {
      authorize?.();
    } catch (cause) {
      await this.options.store.finishCommand(row.id, {
        status: 'failed',
        error: describeError(cause),
      });
      return;
    }
    await this.execute(row, authorize);
  }

  private async execute(row: CommandRow, authorize?: () => void): Promise<void> {
    const log = this.options.log.child({ correlationId: row.id });
    try {
      if (Date.parse(row.expires_at) <= this.options.now().getTime()) {
        await this.options.store.finishCommand(row.id, { status: 'expired' });
        log.warn('command.expired', { capability: row.capability });
        return;
      }
      if (!(await this.options.store.claimCommand(row.id, row.status))) {
        log.debug('command.already_claimed', { capability: row.capability });
        return;
      }
      const outcome = await this.outcomeOf(row, authorize);
      const key = JSON.stringify([row.device_id, row.capability]);
      if (outcome.status === 'succeeded')
        this.intended.set(key, {
          value: row.value,
          completedAt: this.options.now().getTime(),
          expiresAt: Date.parse(row.expires_at),
        });
      else this.intended.delete(key);
      await this.options.store.finishCommand(row.id, outcome);
      this.options.effects?.finished(row);
      log.info(`command.${outcome.status}`, {
        capability: row.capability,
        ...(outcome.status === 'failed' ? { error: outcome.error } : {}),
      });
    } catch (cause) {
      log.error('command.not_recorded', cause, { capability: row.capability });
    }
  }

  private async outcomeOf(row: CommandRow, authorize?: () => void): Promise<CommandOutcome> {
    try {
      authorize?.();
      const result = isHubCapability(row.capability)
        ? await this.options.hubCommand(
            HUB_COMMAND.parse({ capability: row.capability, value: row.value }),
          )
        : await this.executeOnDevice(this.options.effects?.prepare(row) ?? row);
      return { status: 'succeeded', result };
    } catch (cause) {
      return { status: 'failed', error: describeError(cause) };
    }
  }

  private async executeOnDevice(row: CommandRow): Promise<JsonValue> {
    if (row.device_id === null) {
      throw new CommandTargetError(
        row.id,
        `the device capability ${row.capability} names no device`,
      );
    }
    const device = this.options.inventory.deviceById(row.device_id);
    if (device === undefined) {
      throw new CommandTargetError(row.id, `device ${row.device_id} is not known to this hub`);
    }
    const capability = CAPABILITY_KEY.parse(row.capability);
    const value = validateCommand(device, { capability, value: row.value });
    const command = { commandId: row.id, externalId: device.externalId, capability, value };
    const driver =
      device.provider === 'local' ? this.options.drivers.forDevice(device.externalId) : null;
    if (driver !== null) {
      return driver.execute(command);
    }
    const adapter = this.options.adapters.adapterFor(device.provider);
    if (adapter === undefined) {
      throw new ProviderNotRunningError(device.provider);
    }
    return adapter.execute(command);
  }
}
