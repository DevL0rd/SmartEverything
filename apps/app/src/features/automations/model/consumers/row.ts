import { z } from 'zod';
import type { AutomationRowV3, AutomationV3, TriggerNode } from '@smarteverything/domain';

export type ConsumerRow = Pick<AutomationRowV3, 'id' | 'name' | 'enabled' | 'definition'>;

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
