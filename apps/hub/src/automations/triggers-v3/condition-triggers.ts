import type { PortValue, TriggerNode } from '@smarteverything/domain';
import type { Checked } from '@smarteverything/flow/interpret/frames';
import type { Cancel, Clock } from '../../clock';
import type { TriggerFire } from './payload';
import type { ConditionEntry, TriggerProblem } from './trigger-types';

export const CONDITION_TRIGGER_KIND = 'trigger.becomes_true';

const CONDITION_PORT = 'condition';

const HOLD_PORT = 'hold';

export interface ConditionHost {
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly keysOf: (condition: PortValue) => readonly string[];
  readonly watch: (keys: readonly string[], changed: () => void) => Cancel;
  readonly evaluate: (entry: ConditionEntry) => Checked<boolean>;
  readonly fire: (fire: TriggerFire) => void;
  readonly problem: (problem: TriggerProblem) => void;
}

type ConditionCompiled = { readonly condition: ConditionEntry } | { readonly problem: string };

function holdOf(node: TriggerNode): number | string {
  const port = node.ports[HOLD_PORT];
  if (port === undefined) return 0;
  if (!('lit' in port)) return `${HOLD_PORT} must be a fixed value on a ${node.kind} trigger`;
  const { lit } = port;
  return typeof lit === 'number' && Number.isInteger(lit) && lit >= 0
    ? lit
    : `${HOLD_PORT} must be a whole number of milliseconds`;
}

export function compileCondition(automationId: string, node: TriggerNode): ConditionCompiled {
  const condition = node.ports[CONDITION_PORT];
  if (condition === undefined) return { problem: `${node.kind} needs a ${CONDITION_PORT}` };
  const holdMs = holdOf(node);
  if (typeof holdMs === 'string') return { problem: holdMs };
  return {
    condition: {
      automationId,
      triggerId: node.id,
      key: node.key,
      kind: node.kind,
      condition,
      holdMs,
    },
  };
}

class ConditionWatch {
  private truth: boolean | undefined;
  private holding: Cancel | undefined;
  private failure: string | undefined;
  private readonly release: Cancel;

  constructor(
    private readonly entry: ConditionEntry,
    private readonly host: ConditionHost,
  ) {
    const keys = host.keysOf(entry.condition);
    if (keys.length === 0)
      this.report('The condition reads nothing that can change, so it can never become true');
    this.release = host.watch(keys, () => {
      this.check();
    });
    this.check();
  }

  stop(): void {
    this.release();
    this.holding?.();
    this.holding = undefined;
  }

  private check(): void {
    const result = this.host.evaluate(this.entry);
    if (!result.ok) {
      this.report(result.message);
      this.settle(false);
      return;
    }
    this.failure = undefined;
    this.settle(result.value);
  }

  private settle(holds: boolean): void {
    const before = this.truth;
    this.truth = holds;
    if (!holds) {
      this.holding?.();
      this.holding = undefined;
      return;
    }
    if (before === false) this.begin();
  }

  private begin(): void {
    const { holdMs } = this.entry;
    if (holdMs === 0) {
      this.emit(this.host.clock.now());
      return;
    }
    const due = new Date(this.host.clock.now().getTime() + holdMs);
    this.holding = this.host.clock.at(due, () => {
      this.holding = undefined;
      this.emit(due);
    });
  }

  private emit(at: Date): void {
    const { automationId, triggerId, key, kind } = this.entry;
    const stamp = at.toISOString();
    this.host.fire({ automationId, triggerId, key, kind, at: stamp, payload: { at: stamp } });
  }

  private report(message: string): void {
    if (this.failure === message) return;
    this.failure = message;
    const { automationId, triggerId } = this.entry;
    this.host.problem({ automationId, triggerId, message });
  }
}

export function armConditionTriggers(
  entries: readonly ConditionEntry[],
  host: ConditionHost,
): Cancel {
  const watches = entries.map((entry) => new ConditionWatch(entry, host));
  return (): void => {
    for (const watch of watches) watch.stop();
  };
}
