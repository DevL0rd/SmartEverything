import { NODE_REGISTRY } from '@smarteverything/domain';
import type { JsonValue, LiveChange, StateRow } from '@smarteverything/domain';
import type { KeptScope } from '@smarteverything/flow/interpret/kept-types';
import type { StateMemoryPort } from '@smarteverything/flow/interpret/state-ops';
import { z } from 'zod';
import type { Clock } from '../../clock';
import type { ChangeFeed } from '../../store/feed';
import type { WorldReadDeps } from '../world-v3/deps';
import {
  overlaidStateMemory,
  stateMemoryFromRows,
  transientNodeMemory,
  transientStateMemory,
} from '../world-v3/node-memory';
import type { NodeMemory } from '../world-v3/node-memory';
import { outputsOf } from '../world-v3/read-port';
import type { ReadInputs, ReadResult, ReadScope, WorldReads } from '../world-v3/read-port';
import { DEVICE_REF, TARGET_VALUE } from '../world-v3/refs';
import { devicesOf } from '../world-v3/targets';
import type { PersistentVariable, PersistentVariables } from '../world-v3/variables';
import { createWorldReads } from '../world-v3/world-reads';

interface DeviceChange {
  readonly device: string;
  readonly control: string;
  readonly value: JsonValue;
  readonly before: JsonValue | undefined;
  readonly at: string;
}

interface Held {
  readonly value: JsonValue;
  readonly previous: JsonValue | undefined;
  readonly changedAt: number;
}

const DEVICE_GET = z.object({ device: DEVICE_REF, control: z.string().min(1).optional() });

export const CONTROL_DEFAULT = z
  .string()
  .parse(NODE_REGISTRY.get('device.get')?.inputs.find((port) => port.name === 'control')?.default);

function variableKey(automationId: string, name: string, kept?: KeptScope): string {
  return kept === undefined
    ? `${automationId}/${name}`
    : `${automationId}/${kept.instance}/${name}`;
}

function keyOf(device: string, control: string): string {
  return `${device}\u0000${control}`;
}

class SimFeed implements Pick<ChangeFeed, 'subscribe'> {
  private readonly listeners = new Set<(change: LiveChange) => void>();
  private sequence = 0;

  subscribe = (listener: (change: LiveChange) => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  deviceChanged(change: DeviceChange): void {
    this.sequence += 1;
    const { device, control, value, before, at } = change;
    const row = (held: JsonValue): StateRow => ({
      device_id: device,
      capability: control,
      value: held,
      observed_at: at,
    });
    const live: LiveChange = {
      type: 'change',
      table: 'device_state',
      operation: before === undefined ? 'INSERT' : 'UPDATE',
      record: row(value),
      oldRecord: before === undefined ? null : row(before),
      seq: this.sequence,
    };
    for (const listener of [...this.listeners]) listener(live);
  }
}

export class ScenarioWorld {
  readonly feed = new SimFeed();
  private readonly held = new Map<string, Held>();
  private readonly variables = new Map<string, PersistentVariable>();
  private readonly memory: NodeMemory = transientNodeMemory();
  private readonly states = transientStateMemory();
  private readonly inner: WorldReads;

  constructor(
    private readonly base: WorldReadDeps,
    private readonly clock: Pick<Clock, 'now'>,
  ) {
    this.inner = createWorldReads(this.overlaid());
  }

  setDevice(device: string, control: string, value: JsonValue): void {
    const now = this.clock.now();
    const before = this.deviceValue(device, control);
    this.held.set(keyOf(device, control), {
      value,
      previous: before,
      changedAt: now.getTime(),
    });
    this.feed.deviceChanged({ device, control, value, before, at: now.toISOString() });
  }

  setVariable(automationId: string, name: string, value: JsonValue, kept?: KeptScope): void {
    const before = this.persistent(automationId, name, kept);
    this.variables.set(variableKey(automationId, name, kept), {
      value,
      revision: (before?.revision ?? 0) + 1,
    });
  }

  variable(automationId: string, name: string, kept?: KeptScope): PersistentVariable | undefined {
    return this.persistent(automationId, name, kept);
  }

  deviceValue(device: string, control: string): JsonValue | undefined {
    return this.held.get(keyOf(device, control))?.value ?? this.base.observed(device, control);
  }

  deviceIds(target: JsonValue): readonly string[] {
    return devicesOf(this.base.store, TARGET_VALUE.parse(target)).map((device) => device.id);
  }

  persistentVariables(): PersistentVariables {
    return { read: (automationId, name, kept) => this.persistent(automationId, name, kept) };
  }

  reads(): WorldReads {
    return { read: (kind, inputs, scope) => this.read(kind, inputs, scope) };
  }

  stateMemory(): StateMemoryPort {
    return overlaidStateMemory(
      this.states,
      stateMemoryFromRows(this.base.store.automationNodeState),
    );
  }

  private persistent(
    automationId: string,
    name: string,
    kept?: KeptScope,
  ): PersistentVariable | undefined {
    return (
      this.variables.get(variableKey(automationId, name, kept)) ??
      this.base.persistent.read(automationId, name, kept)
    );
  }

  private overlaid(): WorldReadDeps {
    const persistent: PersistentVariables = {
      read: (automationId, name, kept) => this.persistent(automationId, name, kept),
    };
    const memory: NodeMemory = {
      recall: (automationId, nodeId) =>
        this.memory.recall(automationId, nodeId) ?? this.base.memory.recall(automationId, nodeId),
      keep: (automationId, nodeId, kept) => {
        this.memory.keep(automationId, nodeId, kept);
      },
    };
    return {
      ...this.base,
      clock: this.clock,
      persistent,
      memory,
      observed: (device, control) => this.deviceValue(device, control),
    };
  }

  private read(kind: string, inputs: ReadInputs, scope: ReadScope): ReadResult {
    const result = this.inner.read(kind, inputs, scope);
    if (kind !== 'device.get') return result;
    const request = DEVICE_GET.parse(inputs);
    const held = this.held.get(keyOf(request.device, request.control ?? CONTROL_DEFAULT));
    if (held === undefined) return result;
    const changedAt = new Date(held.changedAt).toISOString();
    return {
      ...outputsOf({
        ...result.outputs,
        value: held.value,
        reading: held.value,
        previous: held.previous,
        changedAt,
        inStateFor: Math.max(0, this.clock.now().getTime() - held.changedAt),
      }),
    };
  }
}
