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
import type { CommandExecutor } from './executor';
import { background } from '@smarteverything/logging';

interface Owner {
  readonly authorize?: (() => void) | undefined;
  readonly record?: ((rows: readonly CommandRow[]) => void) | undefined;
}

interface Stack {
  readonly base: JsonValue;
  readonly effects: readonly DeviceEffect[];
}

export class DeviceEffects {
  private executor: CommandExecutor | undefined;
  private stopFeed: (() => void) | undefined;
  private stopped = false;
  private readonly own = new Set<string>();
  private readonly pending = new Set<Promise<void>>();
  private readonly interrupted: DeviceEffectTarget[] = [];
  constructor(
    private readonly store: Store,
    private readonly log: Logger,
  ) {}
  attach(executor: CommandExecutor): void {
    this.executor = executor;
    for (const target of this.store.deviceEffects.list()) this.interrupt(target);
    this.stopFeed = this.store.feed.subscribe((change) => {
      if (change.table === 'device_state' && change.record !== null) this.observe(change.record);
    });
  }
  private interrupt(target: DeviceEffectTarget): void {
    this.store.write(() => {
      for (const command of this.store.commands.open())
        if (
          command.device_id === target.device_id &&
          command.capability === target.capability &&
          command.source === 'automation' &&
          command.requested_by === null
        )
          this.store.commands.finish(command.id, {
            status: 'failed',
            error: 'The hub stopped before this temporary change finished. It was not replayed.',
          });
      this.store.deviceEffects.clear(target.device_id, target.capability);
    });
    this.interrupted.push(target);
  }
  private commands(): CommandExecutor {
    if (this.executor === undefined)
      throw new ApiError('conflict', 'Temporary device changes are not ready.');
    return this.executor;
  }
  private descriptor(deviceId: string, key: string): DeviceCapability {
    const capability = capabilityOf(this.store.devices.byId(deviceId), CAPABILITY_KEY.parse(key));
    if (capability === undefined)
      throw new ApiError('command_refused', `Control ${key} is unavailable.`);
    const reason = deviceEffectSupport(capability);
    if (reason !== null) throw new ApiError('command_refused', reason);
    return capability;
  }
  private stack(deviceId: string, capability: string): Stack {
    const existing = this.store.deviceEffects.find(deviceId, capability);
    if (existing !== undefined) return existing;
    const observed = this.store.state
      .list()
      .find((row) => row.device_id === deviceId && row.capability === capability);
    const intended = this.commands().intendedValue(deviceId, capability, observed?.observed_at);
    const base = intended === undefined ? observed?.value : intended;
    if (base === undefined)
      throw new ApiError('command_refused', 'This control has no current value.');
    checkValue(this.descriptor(deviceId, capability).value, base);
    return { base, effects: [] };
  }
  private put(deviceId: string, capability: string, stack: Stack): JsonValue {
    if (stack.effects.length === 0) {
      this.store.deviceEffects.clear(deviceId, capability);
      return stack.base;
    }
    const resolved = resolveDeviceEffects(
      this.descriptor(deviceId, capability).value,
      stack.base,
      stack.effects,
    );
    this.store.deviceEffects.save({
      device_id: deviceId,
      capability: CAPABILITY_KEY.parse(capability),
      base: stack.base,
      resolved,
      effects: [...stack.effects],
    });
    return resolved;
  }
  prepare(row: CommandRow): CommandRow {
    if (row.device_id === null || this.own.has(row.id)) return row;
    const before = this.store.deviceEffects.find(row.device_id, row.capability);
    if (before === undefined) return row;
    const effects = this.store.deviceEffects.policy(row.id) === 'cancel' ? [] : before.effects;
    const { device_id: deviceId, capability } = row;
    const value = this.store.write(() =>
      this.put(deviceId, capability, { base: row.value, effects }),
    );
    return { ...row, value };
  }
  private async dispatch(
    deviceId: string,
    capability: string,
    value: JsonValue,
    owner: Owner = {},
  ): Promise<void> {
    const row = this.store.write(() => {
      const [command] = this.store.commands.insert([
        { deviceId, capability, value, source: 'automation', requestedBy: null },
      ]);
      if (command === undefined)
        throw new ApiError('conflict', 'Temporary change produced no command.');
      owner.record?.([command]);
      return command;
    });
    this.own.add(row.id);
    try {
      await this.commands().run(row, true, owner.authorize);
    } finally {
      this.own.delete(row.id);
    }
    const result = this.store.commands.byId(row.id);
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
      readonly record: (rows: readonly CommandRow[]) => void;
    },
  ): Promise<string> {
    const { effect, authorize, record } = request;
    return this.commands().admit(deviceId, capability, async () => {
      authorize();
      if (!this.store.devices.byId(deviceId).online)
        throw new ApiError('command_refused', 'The device is offline.');
      const before = this.stack(deviceId, capability);
      const added = {
        ...effect,
        id: randomUUID(),
        order: Math.max(0, ...before.effects.map((entry) => entry.order)) + 1,
      };
      const value = this.store.write(() =>
        this.put(deviceId, capability, { ...before, effects: [...before.effects, added] }),
      );
      try {
        await this.dispatch(deviceId, capability, value, { authorize, record });
      } catch (cause) {
        this.store.write(() => this.put(deviceId, capability, before));
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
    const control = this.store.deviceEffects.controlOf(id);
    if (control === undefined) return;
    const { device_id: deviceId, capability } = control;
    await this.commands().admit(deviceId, capability, async () => {
      const before = this.store.deviceEffects.find(deviceId, capability);
      if (before?.effects.some((effect) => effect.id === id) !== true) return;
      const value = this.store.write(() =>
        this.put(deviceId, capability, {
          base: before.base,
          effects: before.effects.filter((effect) => effect.id !== id),
        }),
      );
      await this.dispatch(deviceId, capability, value, { authorize, record });
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
      Date.parse(observedAt) >= Date.parse(target.updated_at) &&
      !jsonEquals(value, target.resolved)
    );
  }
  private observe(row: StateRow): void {
    const { device_id: deviceId, capability, observed_at: observedAt } = row;
    if (
      this.stopped ||
      !this.external(this.store.deviceEffects.find(deviceId, capability), row.value, observedAt)
    )
      return;
    const work = this.commands()
      .admit(deviceId, capability, async () => {
        const before = this.store.deviceEffects.find(deviceId, capability);
        const value = this.store.state.value(deviceId, capability);
        if (this.stopped || !this.external(before, value, observedAt) || value === undefined)
          return;
        const resolved = this.store.write(() =>
          this.put(deviceId, capability, { base: value, effects: before.effects }),
        );
        await this.dispatch(deviceId, capability, resolved);
      })
      .catch((cause: unknown) => {
        this.log.error('effect.external_failed', cause, { capability });
      });
    this.pending.add(work);
    background(
      work.finally(() => {
        this.pending.delete(work);
      }),
      'effects.background_failed',
    );
  }
  async recover(): Promise<void> {
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
