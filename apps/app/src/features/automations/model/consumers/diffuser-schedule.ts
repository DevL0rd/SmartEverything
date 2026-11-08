import type { AutomationV3 } from '@smarteverything/domain';
import { compareText } from '../../../../format/text';
import { activeTriggers, literalOf, targetsDevice, type ConsumerRow } from './row';

export interface ScheduleLine {
  readonly text: string;
  readonly automationId: string;
}

interface PowerChange {
  readonly at: string;
  readonly on: boolean;
  readonly automationId: string;
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
