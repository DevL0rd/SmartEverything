import type { InputPort, JsonValue, TriggerNode } from '@smarteverything/domain';
import { literalFits } from '@smarteverything/flow/check/literals';
import type { Checked } from '@smarteverything/flow/interpret/frames';
import type { TriggerFire } from './payload';

const MANUAL_ID = 'manual';

const MANUAL_KEY = 'manual';

const CALL_KEY = 'call';

function invalid(message: string): Checked<never> {
  return { ok: false, class: 'Invalid', message };
}

function inputProblem(port: InputPort, given: JsonValue | undefined): string | null {
  if (given === undefined) {
    return port.required && port.default === undefined ? `Input "${port.name}" is required` : null;
  }
  return literalFits(port.type, given) ? null : `Input "${port.name}" does not fit its type`;
}

export function resolveCalledInputs(
  declared: readonly InputPort[],
  given: Readonly<Record<string, JsonValue>>,
): Checked<Readonly<Record<string, JsonValue>>> {
  const names = new Set(declared.map((port) => port.name));
  const unknown = Object.keys(given).find((name) => !names.has(name));
  if (unknown !== undefined) return invalid(`This automation has no input "${unknown}"`);
  const resolved: Record<string, JsonValue> = {};
  for (const port of declared) {
    const value = given[port.name];
    const problem = inputProblem(port, value);
    if (problem !== null) return invalid(problem);
    const chosen = value ?? port.default;
    if (chosen !== undefined) resolved[port.name] = chosen;
  }
  return { ok: true, value: resolved };
}

export interface CalledRun {
  readonly fire: TriggerFire;
  readonly inputs: Readonly<Record<string, JsonValue>>;
}

function calledEntry(nodes: readonly TriggerNode[]): TriggerNode | undefined {
  return nodes.find((node) => node.kind === 'trigger.called' && node.enabled !== false);
}

export function calledRun(request: {
  readonly automationId: string;
  readonly nodes: readonly TriggerNode[];
  readonly declared: readonly InputPort[];
  readonly given: Readonly<Record<string, JsonValue>>;
  readonly at: Date;
}): Checked<CalledRun> {
  const inputs = resolveCalledInputs(request.declared, request.given);
  if (!inputs.ok) return inputs;
  const entry = calledEntry(request.nodes);
  const at = request.at.toISOString();
  const fire: TriggerFire = {
    automationId: request.automationId,
    triggerId: entry?.id ?? MANUAL_ID,
    key: entry === undefined ? MANUAL_KEY : CALL_KEY,
    kind: 'trigger.called',
    at,
    payload: { at },
  };
  return { ok: true, value: { fire, inputs: inputs.value } };
}
