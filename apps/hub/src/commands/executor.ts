import type { DeviceEffects } from './effects';
import type { TelevisionRouting } from './television-routing';
import {
  absorbedOutcome,
  laneKey,
  sameRequester,
  togetherDriver,
  type Begun,
  type QueuedCommand,
  type Started,
  type TogetherDriver,
} from './command-queue';
import { commandBudgetMs } from './command-budgets';
import type { CommandConfirmations } from './command-confirmations';
import { deviceCommandOf, executeOnDevice, stateKindOf } from './device-dispatch';
import { IntendedValues } from './intended-values';
import { CommandLanes } from './lanes';
import {
  HUB_COMMAND,
  isHubCapability,
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
  readonly confirmations?: Pick<CommandConfirmations, 'expect'>;
}

interface Sent {
  readonly outcome: CommandOutcome;
  readonly sent: readonly CommandRow[];
}

export class CommandExecutor {
  private readonly lane = new CommandLanes();
  private readonly queued = new Map<string, QueuedCommand>();
  private readonly held = new Map<string, Set<Promise<void>>>();
  private readonly intended: IntendedValues;
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(private readonly options: CommandExecutorOptions) {
    this.intended = new IntendedValues(options.now);
  }

  async catchUp(): Promise<number> {
    const rows = await this.options.store.pendingCommands();
    for (const row of rows) background(this.run(row), 'executor.run_failed');
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

  runsTogether(rows: readonly CommandRow[]): boolean {
    return togetherDriver(this.options, rows) !== null;
  }

  runTogether(rows: readonly CommandRow[], authorize?: () => void): Promise<void> {
    const work = this.together(rows, authorize);
    for (const row of rows) {
      this.inFlight.set(row.id, work);
      this.held.get(laneKey(row.device_id, row.capability))?.add(work);
    }
    return work.finally(() => {
      for (const row of rows) this.inFlight.delete(row.id);
    });
  }

  private async together(rows: readonly CommandRow[], authorize?: () => void): Promise<void> {
    const driver = togetherDriver(this.options, rows);
    if (driver === null) {
      await Promise.all(rows.slice(0, -1).map((row) => this.authorizedExecute(row, authorize)));
      const last = rows.at(-1);
      if (last !== undefined) await this.authorizedExecute(last, authorize);
      return;
    }
    const started: { readonly row: CommandRow; readonly begun: Started }[] = [];
    for (const row of rows) {
      const begun = await this.begin(row);
      if (!('finished' in begun)) started.push({ row, begun });
    }
    const { outcome, sent } = await this.togetherOutcome(
      driver,
      started.map(({ row }) => row),
      authorize,
    );
    for (const [index, { row, begun }] of started.entries()) {
      try {
        await this.settle(row, outcome, begun, sent[index] ?? row);
      } catch (cause) {
        begun.log.error('command.not_recorded', cause, begun.fields);
      }
    }
  }

  private async togetherOutcome(
    driver: TogetherDriver,
    rows: readonly CommandRow[],
    authorize?: () => void,
  ): Promise<Sent> {
    try {
      authorize?.();
      const sent = rows.map((row) => this.options.effects?.prepare(row) ?? row);
      const commands = sent.map((row) => deviceCommandOf(this.options, row).command);
      return {
        outcome: { status: 'succeeded', result: await driver.executeTogether(commands) },
        sent,
      };
    } catch (cause) {
      return { outcome: { status: 'failed', error: failureLine(cause) }, sent: rows };
    }
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
    return row.status === 'pending' && stateKindOf(this.options, row) !== null;
  }

  intendedValue(deviceId: string, capability: string, observedAt?: string): JsonValue | undefined {
    return this.intended.value(laneKey(deviceId, capability), observedAt);
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
    const begun = await this.begin(row);
    if ('finished' in begun) return begun.finished;
    const { log, fields, startedAt } = begun;
    try {
      const { outcome, sent } = await this.outcomeOf(row, authorize);
      await this.settle(row, outcome, { log, fields, startedAt }, sent[0] ?? row);
      return outcome;
    } catch (cause) {
      log.error('command.not_recorded', cause, { ...fields, durationMs: this.since(startedAt) });
      return undefined;
    }
  }

  private async begin(row: CommandRow): Promise<Begun> {
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
        return { finished: expired };
      }
      if (!(await this.options.store.claimCommand(row.id, row.status))) {
        log.debug('command.already_claimed', () => ({ ...fields, status: row.status }));
        return { finished: undefined };
      }
      log.debug('command.started', fields);
      return { log, fields, startedAt };
    } catch (cause) {
      log.error('command.not_recorded', cause, { ...fields, durationMs: this.since(startedAt) });
      return { finished: undefined };
    }
  }

  private async settle(
    row: CommandRow,
    outcome: CommandOutcome,
    { log, fields, startedAt }: Started,
    sent: CommandRow,
  ): Promise<void> {
    const key = laneKey(row.device_id, row.capability);
    if (outcome.status === 'succeeded')
      this.intended.record(key, {
        value: row.value,
        sentAt: startedAt,
        expiresAt: Date.parse(row.expires_at),
      });
    else this.intended.drop(key);
    await this.options.store.finishCommand(row.id, outcome);
    this.report(log, outcome, { ...fields, durationMs: this.since(startedAt) });
    if (outcome.status === 'succeeded') this.expectState(sent, startedAt);
  }

  private expectState(sent: CommandRow, sentAt: number): void {
    const deviceKind = stateKindOf(this.options, sent);
    if (sent.device_id === null || deviceKind === null) return;
    this.options.confirmations?.expect({
      commandId: sent.id,
      deviceId: sent.device_id,
      capability: sent.capability,
      value: sent.value,
      sentAt,
      budgetMs: commandBudgetMs({ capability: sent.capability, value: sent.value, deviceKind }),
    });
  }

  private since(startedAt: number): number {
    return this.options.now().getTime() - startedAt;
  }

  private report(log: Logger, outcome: CommandOutcome, fields: Record<string, unknown>): void {
    if (outcome.status === 'failed')
      log.warn('command.failed', { ...fields, error: outcome.error });
    else log.info(`command.${outcome.status}`, fields);
  }

  private async outcomeOf(row: CommandRow, authorize?: () => void): Promise<Sent> {
    let sent = row;
    try {
      authorize?.();
      if (isHubCapability(row.capability)) {
        const command = HUB_COMMAND.parse({ capability: row.capability, value: row.value });
        return {
          outcome: { status: 'succeeded', result: await this.options.hubCommand(command) },
          sent: [row],
        };
      }
      sent = this.options.effects?.prepare(row) ?? row;
      return {
        outcome: { status: 'succeeded', result: await executeOnDevice(this.options, sent) },
        sent: [sent],
      };
    } catch (cause) {
      return { outcome: { status: 'failed', error: failureLine(cause) }, sent: [sent] };
    }
  }
}
