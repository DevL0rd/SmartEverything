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
  type DeviceEffect,
  type DeviceEffectTarget,
  type JsonValue,
  type StateRow,
  type DeviceCapability,
} from '@smarteverything/domain';
import {
  admitEffectCommand,
  effectAuthorities,
  withEffectAuthority,
} from '../harness/effect-authority';
import {
  admitExecutionDevice,
  currentExecutionAuthorities,
} from '../assistant/execution-authority';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';
import type { CommandExecutor } from './executor';
import { EffectObservations } from './effect-observations';

export class DeviceEffects {
  private readonly owners = new Map<string, () => void>();
  private executor: CommandExecutor | null = null;
  private readonly interrupted: DeviceEffectTarget[] = [];
  private readonly pending = new Set<Promise<void>>();
  private stopped = false;
  private readonly observations: EffectObservations;
  private readonly stopFeed: () => void;
  constructor(
    private readonly store: Store,
    private readonly now: () => Date,
    private readonly log: Logger,
  ) {
    this.observations = new EffectObservations(store, now, (row) => {
      this.external(row);
    });
    this.stopFeed = store.feed.subscribe((change) => {
      if (change.table === 'device_state' && change.record !== null) this.observe(change.record);
    });
  }
  attach(executor: CommandExecutor): void {
    this.executor = executor;
    for (const before of this.store.deviceEffects.list()) this.interrupt(before);
  }
  private unfinishedResolution(command: CommandRow | null): boolean {
    if (command === null || (command.status !== 'pending' && command.status !== 'running'))
      return false;
    return this.store.deviceEffects.command(command.id)?.generated === true;
  }
  private interrupt(before: DeviceEffectTarget): void {
    const command = before.command_id === null ? null : this.store.commands.byId(before.command_id);
    if (before.effects.length === 0 && !this.unfinishedResolution(command)) return;
    this.store.write(() => this.remove(before, []));
    if (before.effects.length > 0 && command?.status === 'succeeded') this.interrupted.push(before);
  }
  private observe(row: StateRow): void {
    const previous = this.interrupted.find(
      (target) => target.device_id === row.device_id && target.capability === row.capability,
    );
    if (previous !== undefined && jsonEquals(previous.resolved, row.value)) return;
    this.observations.observe(row);
  }
  private commands(): CommandExecutor {
    if (this.executor === null)
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
  private current(deviceId: string, capability: string): DeviceEffectTarget {
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
    return {
      device_id: deviceId,
      capability: CAPABILITY_KEY.parse(capability),
      base,
      resolved: base,
      generation: 0,
      effects: [],
      command_id: null,
      updated_at: this.now().toISOString(),
    };
  }
  private change(
    target: DeviceEffectTarget,
    base: JsonValue,
    effects: readonly DeviceEffect[],
  ): DeviceEffectTarget {
    const resolved =
      effects.length === 0
        ? base
        : resolveDeviceEffects(
            this.descriptor(target.device_id, target.capability).value,
            base,
            effects,
          );
    return this.store.deviceEffects.save({
      ...target,
      base,
      resolved,
      generation: target.generation + 1,
      effects: [...effects],
    });
  }
  private remove(target: DeviceEffectTarget, effects: readonly DeviceEffect[]): DeviceEffectTarget {
    return this.store.deviceEffects.save({
      ...target,
      resolved: effects.length === 0 ? target.base : target.resolved,
      generation: target.generation + 1,
      effects: [...effects],
    });
  }
  prepare(row: CommandRow): CommandRow {
    if (row.device_id === null) return row;
    const metadata = this.store.deviceEffects.command(row.id);
    if (metadata?.generated === true) {
      const target = this.store.deviceEffects.find(row.device_id, row.capability);
      if (target?.generation !== metadata.generation || target.command_id !== row.id)
        throw new ApiError(
          'command_refused',
          'This temporary device change was replaced or ended.',
        );
      this.observations.begin(row, metadata.value);
      return { ...row, value: metadata.value };
    }
    const before = this.store.deviceEffects.find(row.device_id, row.capability);
    if (before === undefined) return row;
    const target = this.store.write(() => {
      const effects = this.store.deviceEffects.policy(row.id) === 'cancel' ? [] : before.effects;
      const saved = this.change({ ...before, command_id: row.id }, row.value, effects);
      this.metadata(row.id, saved, false);
      return saved;
    });
    this.observations.begin(row, target.resolved);
    return { ...row, value: target.resolved };
  }
  finished(row: CommandRow): void {
    this.observations.finished(row);
    if (this.store.deviceEffects.command(row.id) === undefined) return;
    const owners = new Set(
      this.store.deviceEffects
        .list()
        .flatMap((target) => target.effects.map((effect) => effect.id)),
    );
    for (const id of this.owners.keys()) if (!owners.has(id)) this.owners.delete(id);
  }
  private metadata(commandId: string, target: DeviceEffectTarget, generated: boolean): void {
    this.store.deviceEffects.resolution({
      command_id: commandId,
      device_id: target.device_id,
      capability: target.capability,
      generated,
      base: target.base,
      value: target.resolved,
      generation: target.generation,
      effectIds: target.effects.map((effect) => effect.id),
    });
  }
  private async dispatch(
    target: DeviceEffectTarget,
    authorize: () => void,
    record?: (rows: readonly CommandRow[]) => void,
  ): Promise<void> {
    authorize();
    for (const authority of currentExecutionAuthorities())
      admitExecutionDevice(this.store, target.device_id, authority);
    const output = {
      ...target,
      resolved: resolveDeviceEffects(
        this.descriptor(target.device_id, target.capability).value,
        target.base,
        target.effects,
      ),
    };
    const row = this.store.write(() => {
      const [command] = this.store.commands.insert([
        {
          deviceId: output.device_id,
          capability: output.capability,
          value: output.resolved,
          source: 'automation',
          requestedBy: null,
        },
      ]);
      if (command === undefined)
        throw new ApiError('conflict', 'Temporary change produced no command.');
      const saved = this.store.deviceEffects.save({ ...output, command_id: command.id });
      this.metadata(command.id, saved, true);
      record?.([command]);
      return command;
    });
    await this.commands().run(row, true, authorize);
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
      const before = this.current(deviceId, capability);
      const id = randomUUID();
      const target = this.store.write(() =>
        this.change(before, before.base, [
          ...before.effects,
          { ...effect, id, order: before.generation + 1 },
        ]),
      );
      const authorities = [...currentExecutionAuthorities()];
      this.owners.set(id, (): void => {
        authorize();
        for (const authority of authorities) admitExecutionDevice(this.store, deviceId, authority);
      });
      try {
        await this.dispatch(target, authorize, record);
      } catch (cause) {
        this.store.write(() =>
          this.remove({ ...target, resolved: before.resolved }, before.effects),
        );
        this.owners.delete(id);
        throw cause;
      }
      return id;
    });
  }
  async end(
    id: string,
    authorize: () => void,
    record?: (rows: readonly CommandRow[]) => void,
  ): Promise<void> {
    const found = this.store.deviceEffects
      .list()
      .find((row) => row.effects.some((effect) => effect.id === id));
    if (found === undefined) return;
    await this.commands().admit(found.device_id, found.capability, async () => {
      const before = this.store.deviceEffects.find(found.device_id, found.capability);
      if (before?.effects.some((effect) => effect.id === id) !== true) return;
      const target = this.store.write(() =>
        this.remove(
          before,
          before.effects.filter((effect) => effect.id !== id),
        ),
      );
      try {
        await this.dispatch(target, authorize, record);
      } catch (cause) {
        this.log.error('effect.cleanup_failed', cause, {
          effectId: id,
          capability: target.capability,
        });
        throw cause;
      }
    });
  }
  private external(row: StateRow): void {
    if (this.stopped) return;
    const work = this.commands()
      .admit(row.device_id, row.capability, async () => {
        if (this.stopped) return;
        const before = this.store.deviceEffects.find(row.device_id, row.capability);
        if (before === undefined || Date.parse(row.observed_at) < Date.parse(before.updated_at))
          return;
        const target = this.store.write(() => this.change(before, row.value, before.effects));
        if (target.effects.length > 0 && before.command_id !== null) {
          const commandId = before.command_id;
          const authorize = (): void => {
            admitEffectCommand(this.store, commandId);
            for (const effect of target.effects) {
              const owner = this.owners.get(effect.id);
              if (owner === undefined)
                throw new ApiError('forbidden', 'The temporary change has no active owning run.');
              owner();
            }
          };
          await withEffectAuthority(this.store, 'command', commandId, () =>
            this.dispatch(target, authorize),
          );
        }
      })
      .catch((cause: unknown) => {
        this.log.error('effect.external_failed', cause, { capability: row.capability });
      });
    this.pending.add(work);
    void work.finally(() => {
      this.pending.delete(work);
    });
  }
  async recover(): Promise<void> {
    for (const interrupted of this.interrupted) {
      await this.commands().admit(interrupted.device_id, interrupted.capability, async () => {
        const target = this.store.deviceEffects.find(interrupted.device_id, interrupted.capability);
        if (target?.generation !== interrupted.generation + 1 || target.command_id === null) return;
        try {
          const commandId = target.command_id;
          if (effectAuthorities(this.store, 'command', commandId).length === 0)
            throw new ApiError('forbidden', 'Restart cleanup has no saved initiating authority.');
          await withEffectAuthority(this.store, 'command', commandId, () =>
            this.dispatch(target, () => {
              admitEffectCommand(this.store, commandId);
            }),
          );
        } catch (cause) {
          this.log.error('effect.recovery_failed', cause, { capability: target.capability });
        }
      });
    }
    this.interrupted.length = 0;
  }
  async stop(): Promise<void> {
    this.stopped = true;
    this.stopFeed();
    await Promise.all(this.pending);
    this.owners.clear();
  }
}
