import type { DeviceEffects } from './effects';
import type { TelevisionRouting } from './television-routing';
import { CommandLanes } from './lanes';
import {
  capabilityOf,
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
import { background, failureLine } from '@smarteverything/logging';

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
  readonly television?: TelevisionRouting;
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

interface QueuedCommand {
  readonly row: CommandRow;
  readonly authorize: (() => void) | undefined;
  absorbed: readonly QueuedCommand[];
  replaced: boolean;
  successor: Promise<void> | undefined;
}

function sameRequester(
  previous: QueuedCommand,
  row: CommandRow,
  authorize: (() => void) | undefined,
): boolean {
  return (
    previous.authorize === authorize &&
    previous.row.source === row.source &&
    previous.row.requested_by === row.requested_by
  );
}

function absorbedOutcome(
  authorize: (() => void) | undefined,
  by: string,
  replacement: CommandOutcome | undefined,
): CommandOutcome {
  try {
    authorize?.();
  } catch (cause) {
    return { status: 'failed', error: failureLine(cause) };
  }
  if (replacement === undefined) {
    return { status: 'failed', error: 'A newer command replaced this one and did not run.' };
  }
  return replacement.status === 'succeeded'
    ? { status: 'succeeded', result: { superseded: true, by } }
    : replacement;
}

function laneKey(deviceId: string | null, capability: string): string {
  return JSON.stringify([deviceId, capability]);
}

export class CommandExecutor {
  private readonly lane = new CommandLanes();
  private readonly queued = new Map<string, QueuedCommand>();
  private readonly held = new Map<string, Set<Promise<void>>>();
  private readonly intended = new Map<
    string,
    { readonly value: JsonValue; readonly completedAt: number; readonly expiresAt: number }
  >();
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(private readonly options: CommandExecutorOptions) {}

  async catchUp(): Promise<number> {
    const rows = await this.options.store.pendingCommands();
    for (const row of rows) {
      background(this.run(row), 'executor.run_failed');
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
    const key = laneKey(row.device_id, row.capability);
    const held = admitted ? this.held.get(key) : undefined;
    const execution =
      held === undefined ? this.enqueue(key, row, authorize) : this.runHeld(held, row, authorize);
    const work = execution.finally(() => {
      this.inFlight.delete(row.id);
    });
    this.inFlight.set(row.id, work);
    return work;
  }

  admit<T>(deviceId: string | null, capability: string, work: () => Promise<T>): Promise<T> {
    const key = laneKey(deviceId, capability);
    this.queued.delete(key);
    return this.lane.run(key, async () => {
      const held = new Set<Promise<void>>();
      this.held.set(key, held);
      try {
        return await work();
      } finally {
        await Promise.allSettled(held);
        this.held.delete(key);
      }
    });
  }

  private runHeld(
    held: Set<Promise<void>>,
    row: CommandRow,
    authorize?: () => void,
  ): Promise<void> {
    const work = this.authorizedExecute(row, authorize).then(() => undefined);
    held.add(work);
    return work;
  }

  private enqueue(key: string, row: CommandRow, authorize?: () => void): Promise<void> {
    const entry: QueuedCommand = {
      row,
      authorize,
      absorbed: [],
      replaced: false,
      successor: undefined,
    };
    const previous = this.queued.get(key);
    const coalescible = this.coalescible(row);
    const replaced =
      coalescible && previous !== undefined && sameRequester(previous, row, authorize)
        ? previous
        : undefined;
    if (replaced !== undefined) {
      this.options.log.debug('command.coalesced', {
        correlationId: row.id,
        replacedId: replaced.row.id,
        capability: row.capability,
        deviceId: row.device_id,
      });
      entry.absorbed = [...replaced.absorbed, replaced];
      replaced.absorbed = [];
      replaced.replaced = true;
    }
    if (coalescible) this.queued.set(key, entry);
    else this.queued.delete(key);
    const done = this.lane
      .run(key, async () => {
        if (this.queued.get(key) === entry) this.queued.delete(key);
        if (entry.replaced) return;
        const outcome = await this.authorizedExecute(row, authorize);
        await this.finishAbsorbed(entry.absorbed, row.id, outcome);
      })
      .then(() => entry.successor);
    if (replaced !== undefined) replaced.successor = done;
    return done;
  }

  private coalescible(row: CommandRow): boolean {
    if (row.device_id === null || row.status !== 'pending' || isHubCapability(row.capability)) {
      return false;
    }
    const device = this.options.inventory.deviceById(row.device_id);
    const capability = CAPABILITY_KEY.safeParse(row.capability);
    if (device === undefined || !capability.success) return false;
    const descriptor = capabilityOf(device, capability.data);
    return descriptor?.access === 'read_write' && descriptor.value.kind !== 'action';
  }

  intendedValue(deviceId: string, capability: string, observedAt?: string): JsonValue | undefined {
    const key = laneKey(deviceId, capability);
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
  ): Promise<CommandOutcome | undefined> {
    try {
      authorize?.();
    } catch (cause) {
      const outcome: CommandOutcome = { status: 'failed', error: failureLine(cause) };
      await this.options.store.finishCommand(row.id, outcome);
      return outcome;
    }
    return this.execute(row, authorize);
  }

  private async finishAbsorbed(
    absorbed: readonly QueuedCommand[],
    by: string,
    replacement: CommandOutcome | undefined,
  ): Promise<void> {
    for (const { row, authorize } of absorbed) {
      const log = this.options.log.child({ correlationId: row.id });
      try {
        await this.options.store.finishCommand(row.id, absorbedOutcome(authorize, by, replacement));
        log.info('command.superseded', {
          capability: row.capability,
          deviceId: row.device_id,
          by,
        });
      } catch (cause) {
        log.error('command.not_recorded', cause, { capability: row.capability });
      }
    }
  }

  private async execute(
    row: CommandRow,
    authorize?: () => void,
  ): Promise<CommandOutcome | undefined> {
    const log = this.options.log.child({ correlationId: row.id });
    const startedAt = this.options.now().getTime();
    const fields = {
      capability: row.capability,
      deviceId: row.device_id,
      source: row.source,
      requestedBy: row.requested_by,
      queuedMs: Math.max(0, startedAt - Date.parse(row.created_at)),
    };
    try {
      if (Date.parse(row.expires_at) <= startedAt) {
        const expired: CommandOutcome = { status: 'expired' };
        await this.options.store.finishCommand(row.id, expired);
        log.warn('command.expired', fields);
        return expired;
      }
      if (!(await this.options.store.claimCommand(row.id, row.status))) {
        log.debug('command.already_claimed', () => ({ ...fields, status: row.status }));
        return undefined;
      }
      log.debug('command.started', fields);
      const outcome = await this.outcomeOf(row, authorize);
      const key = laneKey(row.device_id, row.capability);
      if (outcome.status === 'succeeded')
        this.intended.set(key, {
          value: row.value,
          completedAt: this.options.now().getTime(),
          expiresAt: Date.parse(row.expires_at),
        });
      else this.intended.delete(key);
      await this.options.store.finishCommand(row.id, outcome);
      this.report(log, outcome, { ...fields, durationMs: this.since(startedAt) });
      return outcome;
    } catch (cause) {
      log.error('command.not_recorded', cause, { ...fields, durationMs: this.since(startedAt) });
      return undefined;
    }
  }

  private since(startedAt: number): number {
    return this.options.now().getTime() - startedAt;
  }

  private report(log: Logger, outcome: CommandOutcome, fields: Record<string, unknown>): void {
    if (outcome.status === 'failed')
      log.warn('command.failed', { ...fields, error: outcome.error });
    else log.info(`command.${outcome.status}`, fields);
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
      return { status: 'failed', error: failureLine(cause) };
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
    if (this.options.television?.handles(device, command) === true) {
      return this.options.television.execute(device, command);
    }
    const adapter = this.options.adapters.adapterFor(device.provider);
    this.options.log.debug('command.dispatched', {
      correlationId: row.id,
      provider: device.provider,
      deviceId: device.id,
      externalId: device.externalId,
      capability,
      running: adapter !== undefined,
    });
    if (adapter === undefined) {
      throw new ProviderNotRunningError(device.provider);
    }
    return adapter.execute(command);
  }
}
