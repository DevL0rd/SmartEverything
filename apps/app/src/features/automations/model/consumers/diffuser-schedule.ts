import type { AutomationV3, FlowNode } from '@smarteverything/domain';
import { compareText } from '../../../../format/text';
import { activeTriggers, literalOf, recordOf, type ConsumerRow } from './row';

export interface ScheduleLine {
  readonly text: string;
  readonly automationId: string;
}

interface PowerChange {
  readonly at: string;
  readonly on: boolean;
  readonly automationId: string;
}

function stringsOf(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function targetsDevice(node: FlowNode, deviceId: string): boolean {
  const target = recordOf(literalOf(node.ports ?? {}, 'target'));
  return target?.['device'] === deviceId || stringsOf(target?.['devices']).includes(deviceId);
}

function flipsOf(program: AutomationV3, deviceId: string): readonly boolean[] {
  return program.body.nodes.flatMap((node) => {
    const to = literalOf(node.ports ?? {}, 'to');
    return node.enabled !== false &&
      node.kind === 'device.set' &&
      literalOf(node.ports ?? {}, 'control') === 'power' &&
      typeof to === 'boolean' &&
      targetsDevice(node, deviceId)
      ? [to]
      : [];
  });
}

function changesOf(
  program: AutomationV3,
  automationId: string,
  deviceId: string,
): readonly PowerChange[] {
  const times = activeTriggers(program).flatMap((trigger) => {
    const at = literalOf(trigger.ports, 'at');
    return trigger.kind === 'trigger.time' && typeof at === 'string' ? [at] : [];
  });
  const flips = flipsOf(program, deviceId);
  return times.flatMap((at) => flips.map((on) => ({ at, on, automationId })));
}

export function scheduleOf(rows: readonly ConsumerRow[], deviceId: string): ScheduleLine | null {
  const changes = rows
    .filter((row) => row.enabled)
    .flatMap((row) => changesOf(row.definition, row.id, deviceId))
    .sort((left, right) => Number(right.on) - Number(left.on) || compareText(left.at, right.at));
  const [first] = changes;
  if (first === undefined) return null;
  const text = changes.map((change) => `${change.on ? 'on' : 'off'} ${change.at}`).join(' · ');
  return {
    text: `${text.charAt(0).toUpperCase()}${text.slice(1)}`,
    automationId: first.automationId,
  };
}
