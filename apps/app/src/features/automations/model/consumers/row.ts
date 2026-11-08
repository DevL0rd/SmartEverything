import { z } from 'zod';
import type { AutomationV3, FlowNode, TriggerNode } from '@smarteverything/domain';
import type { AutomationRow } from '../../data/graph-adapter';

export type ConsumerRow = Pick<AutomationRow, 'id' | 'name' | 'enabled' | 'definition'>;

export function activeTriggers(program: AutomationV3): readonly TriggerNode[] {
  return program.triggers.filter((trigger) => trigger.enabled !== false);
}

export function literalOf(
  ports: Readonly<Record<string, { readonly lit: unknown } | object>>,
  name: string,
): unknown {
  const port = ports[name];
  return port !== undefined && 'lit' in port ? port.lit : undefined;
}

const RECORD = z.record(z.string(), z.unknown());

export function recordOf(value: unknown): Readonly<Record<string, unknown>> | undefined {
  const parsed = RECORD.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function stringsOf(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export function targetsDevice(node: FlowNode, deviceId: string): boolean {
  const target = recordOf(literalOf(node.ports ?? {}, 'target'));
  return target?.['device'] === deviceId || stringsOf(target?.['devices']).includes(deviceId);
}
