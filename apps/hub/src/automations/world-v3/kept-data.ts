import { FLOW_TYPE, JSON_VALUE, jsonEquals } from '@smarteverything/domain';
import type { FlowType, JsonValue } from '@smarteverything/domain';
import { literalFits } from '@smarteverything/flow/check/literals';
import { z } from 'zod';
import type { AutomationNodeStateRepository } from '../../store/repositories/automation-node-state';
import type { PersistentVariable } from './variables';

const DATA_PREFIX = 'data:';
const INSTANCE_SEPARATOR = '/';

const STORED = z.strictObject({
  type: FLOW_TYPE,
  value: JSON_VALUE,
  revision: z.int().positive(),
});

export interface KeptKey {
  readonly automationId: string;
  readonly instance: string;
  readonly name: string;
  readonly type: FlowType;
}

export interface KeptReset {
  readonly automationId: string;
  readonly instance: string;
  readonly name: string;
  readonly message: string;
}

export interface KeptDataPorts {
  readonly rows: Pick<AutomationNodeStateRepository, 'get' | 'save'>;
  readonly reset: (reset: KeptReset) => void;
}

export function fitsKept(type: FlowType, value: JsonValue): boolean {
  return (value === null && type.t === 'optional') || literalFits(type, value);
}

function typeText(type: FlowType): string {
  return type.t === 'optional' ? `${typeText(type.of)} or nothing` : type.t;
}

function partitionOf(name: string): string {
  return `${DATA_PREFIX}${name}`;
}

type Stored = z.infer<typeof STORED>;

type Looked =
  | { readonly kind: 'none' }
  | { readonly kind: 'kept'; readonly variable: PersistentVariable }
  | { readonly kind: 'stale'; readonly revision: number; readonly reason: string };

function looked(key: KeptKey, stored: Stored): Looked {
  const { value, revision } = stored;
  if (
    jsonEquals(JSON_VALUE.parse(stored.type), JSON_VALUE.parse(key.type)) ||
    fitsKept(key.type, value)
  ) {
    return { kind: 'kept', variable: { value, revision } };
  }
  return {
    kind: 'stale',
    revision,
    reason: `it held ${typeText(stored.type)} and the Custom Node now keeps ${typeText(key.type)}`,
  };
}

export function pruneKeptRows(
  rows: Pick<AutomationNodeStateRepository, 'remove' | 'forAutomation'>,
  automationId: string,
  live: ReadonlySet<string>,
): number {
  const stale = rows
    .forAutomation(automationId)
    .filter((row) => row.partition.startsWith(DATA_PREFIX))
    .filter((row) => row.node_id.split(INSTANCE_SEPARATOR).some((id) => !live.has(id)));
  for (const row of stale) rows.remove(automationId, row.node_id, row.partition);
  return stale.length;
}

export class KeptData {
  constructor(private readonly ports: KeptDataPorts) {}

  read(key: KeptKey): PersistentVariable | undefined {
    const found = this.look(key);
    return found.kind === 'kept' ? found.variable : undefined;
  }

  write(key: KeptKey, value: JsonValue): PersistentVariable {
    const found = this.look(key);
    if (found.kind === 'stale') this.notifyReset(key, found.reason);
    const revision = found.kind === 'none' ? 1 : this.revisionOf(found) + 1;
    this.ports.rows.save({
      automationId: key.automationId,
      nodeId: key.instance,
      partition: partitionOf(key.name),
      state: { type: JSON_VALUE.parse(key.type), value, revision },
    });
    return { value, revision };
  }

  private look(key: KeptKey): Looked {
    const row = this.ports.rows.get(key.automationId, key.instance, partitionOf(key.name));
    if (row === undefined) return { kind: 'none' };
    const stored = STORED.safeParse(row.state);
    return stored.success
      ? looked(key, stored.data)
      : { kind: 'stale', revision: 0, reason: 'its stored form could not be read' };
  }

  private revisionOf(found: Exclude<Looked, { kind: 'none' }>): number {
    return found.kind === 'kept' ? found.variable.revision : found.revision;
  }

  private notifyReset(key: KeptKey, reason: string): void {
    this.ports.reset({
      automationId: key.automationId,
      instance: key.instance,
      name: key.name,
      message: `The Custom Node data "${key.name}" started again from its start value: ${reason}.`,
    });
  }
}
