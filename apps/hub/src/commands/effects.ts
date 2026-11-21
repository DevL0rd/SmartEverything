import { randomUUID } from 'node:crypto';
import {
  ApiError,
  CAPABILITY_KEY,
  capabilityOf,
  checkValue,
  deviceEffectSupport,
  jsonEquals,
  resolveDeviceEffects,
  type CommandRow,
  type DeviceCapability,
  type DeviceEffect,
  type DeviceEffectTarget,
  type JsonValue,
  type StateRow,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';
import { currentExecutionAuthority } from '../assistant/turn-authority';
import { STALE_FRAME_MS } from './command-budgets';
import type { CommandExecutor } from './executor';
import { background } from '@smarteverything/logging';

interface Owner {
  readonly authorize?: (() => void) | undefined;
  readonly ownerRunId: string | null;
  readonly recorded?: ((rows: readonly CommandRow[]) => void) | undefined;
  readonly settled?: ((rows: readonly CommandRow[]) => void) | undefined;
}

const UNOWNED: Owner = { ownerRunId: null };

interface Stack {
  readonly base: JsonValue;
  readonly effects: readonly DeviceEffect[];
}

export class DeviceEffects {
  private executor: CommandExecutor | undefined;
  private stopFeed: (() => void) | undefined;
  private stopped = false;
  private interrupting: Promise<void> = Promise.resolve();
  private readonly own = new Set<string>();
  private readonly pending = new Set<Promise<void>>();
  private readonly interrupted: DeviceEffectTarget[] = [];
  constructor(
    private readonly store: Store,
    private readonly log: Logger,
  ) {}
  attach(executor: CommandExecutor): void {
    this.executor = executor;
    this.interrupting = this.interruptAll();
    this.stopFeed = this.store.feed.subscribe((change) => {
      if (change.table === 'device_state' && change.record !== null) this.observe(change.record);
    });
  }
  private async interruptAll(): Promise<void> {
    for (const target of await this.store.host.call('deviceEffects', 'list')) {
      await this.store.host.write('interruptDeviceEffect', target);
      this.interrupted.push(target);
    }
  }
  private commands(): CommandExecutor {
    if (this.executor === undefined)
      throw new ApiError('conflict', 'Temporary device changes are not ready.');
    return this.executor;
  }
  private async descriptor(deviceId: string, key: string): Promise<DeviceCapability> {
    const device = await this.store.host.call('devices', 'byId', deviceId);
    const capability = capabilityOf(device, CAPABILITY_KEY.parse(key));
    if (capability === undefined)
      throw new ApiError('command_refused', `Control ${key} is unavailable.`);
    const reason = deviceEffectSupport(capability);
    if (reason !== null) throw new ApiError('command_refused', reason);
    return capability;
  }
  private async stack(deviceId: string, capability: string): Promise<Stack> {
    const existing = await this.store.host.call('deviceEffects', 'find', deviceId, capability);
    if (existing !== undefined) return existing;
    const observed = (await this.store.host.call('state', 'ofDevice', deviceId)).find(
      (row) => row.capability === capability,
    );
    const intended = this.commands().intendedValue(deviceId, capability, observed?.observed_at);
    const base = intended === undefined ? observed?.value : intended;
    if (base === undefined)
      throw new ApiError('command_refused', 'This control has no current value.');
    checkValue((await this.descriptor(deviceId, capability)).value, base);
    return { base, effects: [] };
  }
  private async put(deviceId: string, capability: string, stack: Stack): Promise<JsonValue> {
    if (stack.effects.length === 0) {
      await this.store.host.call('deviceEffects', 'clear', deviceId, capability);
      return stack.base;
    }
    const resolved = resolveDeviceEffects(
      (await this.descriptor(deviceId, capability)).value,
      stack.base,
      stack.effects,
    );
    await this.store.host.call('deviceEffects', 'save', {
      device_id: deviceId,
      capability: CAPABILITY_KEY.parse(capability),
      base: stack.base,
      resolved,
      effects: [...stack.effects],
    });
    return resolved;
  }
  async prepare(row: CommandRow): Promise<CommandRow> {
    if (row.device_id === null || this.own.has(row.id)) return row;
    const { device_id: deviceId, capability } = row;
    const before = await this.store.host.call('deviceEffects', 'find', deviceId, capability);
    if (before === undefined) return row;
    const policy = await this.store.host.call('deviceEffects', 'policy', row.id);
    const effects = policy === 'cancel' ? [] : before.effects;
    const value = await this.put(deviceId, capability, { base: row.value, effects });
    return { ...row, value };
  }
  private async dispatch(
    deviceId: string,
    capability: string,
    value: JsonValue,
    owner: Owner = UNOWNED,
  ): Promise<void> {
    const [row] = await this.store.host.write('insertCommands', {
      commands: [{ deviceId, capability, value, source: 'automation', requestedBy: null }],
      ownerRunId: owner.ownerRunId,
      authority: currentExecutionAuthority() ?? null,
    });
    if (row === undefined) throw new ApiError('conflict', 'Temporary change produced no command.');
    owner.recorded?.([row]);
    this.own.add(row.id);
    try {
      await this.commands().run(row, true, owner.authorize);
    } finally {
      this.own.delete(row.id);
    }
    const result = await this.store.host.call('commands', 'byId', row.id);
    owner.settled?.([result]);
    if (result.status !== 'succeeded')
      throw new ApiError(
        'upstream_failed',
        result.error ?? 'The temporary device command did not complete.',
      );
  }
  async activate(
    deviceId: string,
    capability: string,
    request: {
      readonly effect: Omit<DeviceEffect, 'id' | 'order'>;
      readonly authorize: () => void;
      readonly ownerRunId: string;
      readonly recorded: (rows: readonly CommandRow[]) => void;
    },
  ): Promise<string> {
    const { effect, authorize, ownerRunId, recorded } = request;
    return this.commands().admit(deviceId, capability, async () => {
      authorize();
      if (!(await this.store.host.call('devices', 'byId', deviceId)).online)
        throw new ApiError('command_refused', 'The device is offline.');
      const before = await this.stack(deviceId, capability);
      const added = {
        ...effect,
        id: randomUUID(),
        order: Math.max(0, ...before.effects.map((entry) => entry.order)) + 1,
      };
      const value = await this.put(deviceId, capability, {
        ...before,
        effects: [...before.effects, added],
      });
      try {
        await this.dispatch(deviceId, capability, value, { authorize, ownerRunId, recorded });
      } catch (cause) {
        await this.put(deviceId, capability, before);
        throw cause;
      }
      return added.id;
    });
  }
  async end(
    id: string,
    authorize: () => void,
    record?: (rows: readonly CommandRow[]) => void,
  ): Promise<void> {
    const control = await this.store.host.call('deviceEffects', 'controlOf', id);
    if (control === undefined) return;
    const { device_id: deviceId, capability } = control;
    await this.commands().admit(deviceId, capability, async () => {
      const before = await this.store.host.call('deviceEffects', 'find', deviceId, capability);
      if (before?.effects.some((effect) => effect.id === id) !== true) return;
      const value = await this.put(deviceId, capability, {
        base: before.base,
        effects: before.effects.filter((effect) => effect.id !== id),
      });
      await this.dispatch(deviceId, capability, value, {
        authorize,
        ownerRunId: null,
        settled: record,
      });
    });
  }
  private external(
    target: DeviceEffectTarget | undefined,
    value: JsonValue | undefined,
    observedAt: string,
  ): target is DeviceEffectTarget {
    return (
      target !== undefined &&
      value !== undefined &&
      Date.parse(observedAt) >= Date.parse(target.updated_at) + STALE_FRAME_MS &&
      !jsonEquals(value, target.resolved)
    );
  }
  private observe(row: StateRow): void {
    if (this.stopped) return;
    const work = this.reconcile(row).catch((cause: unknown) => {
      this.log.error('effect.external_failed', cause, { capability: row.capability });
    });
    this.pending.add(work);
    background(
      work.finally(() => {
        this.pending.delete(work);
      }),
      'effects.background_failed',
    );
  }
  private async reconcile(row: StateRow): Promise<void> {
    const { device_id: deviceId, capability, observed_at: observedAt } = row;
    await this.interrupting;
    const { host } = this.store;
    const target = await host.call('deviceEffects', 'find', deviceId, capability);
    if (this.stopped || !this.external(target, row.value, observedAt)) return;
    await this.commands().admit(deviceId, capability, async () => {
      const before = await host.call('deviceEffects', 'find', deviceId, capability);
      const value = await host.call('state', 'value', deviceId, capability);
      if (this.stopped || !this.external(before, value, observedAt) || value === undefined) return;
      const resolved = await this.put(deviceId, capability, {
        base: value,
        effects: before.effects,
      });
      await this.dispatch(deviceId, capability, resolved);
    });
  }
  async recover(): Promise<void> {
    await this.interrupting;
    for (const { device_id: deviceId, capability, base } of this.interrupted.splice(0))
      await this.commands().admit(deviceId, capability, async () => {
        try {
          await this.dispatch(deviceId, capability, base);
        } catch (cause) {
          this.log.error('effect.recovery_failed', cause, { capability });
        }
      });
  }
  async stop(): Promise<void> {
    this.stopped = true;
    this.stopFeed?.();
    await Promise.all(this.pending);
  }
}
