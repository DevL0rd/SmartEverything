import {
  NODE_REGISTRY,
  type FlowNode,
  type JsonValue,
  type PortValue,
} from '@smarteverything/domain';
import type {
  Checked,
  Evaluated,
  Failure,
  NodeResult,
  PureEvaluator,
  ReadPort,
} from '@smarteverything/flow/interpret/frames';
import { triggerScope, type TriggerFire } from './payload';
import { AUTOMATION_LEVEL } from '@smarteverything/flow/interpret/kept';

interface AdmissionReads {
  readonly nodes: readonly FlowNode[];
  readonly port: ReadPort;
  readonly pure: (kind: string) => PureEvaluator | undefined;
}

export interface AdmissionParts {
  readonly admit?: PortValue | undefined;
  readonly reads?: AdmissionReads | undefined;
  readonly roots?: Snapshot | undefined;
}

type Snapshot = Readonly<Record<string, JsonValue>>;

export type AdmitVerdict =
  | { readonly admitted: true }
  | {
      readonly admitted: false;
      readonly failure?: Failure | undefined;
    };

const LEADING: ReadonlySet<string> = new Set(['read', 'pure']);

const ADMITTED: AdmitVerdict = { admitted: true };

function truth(result: Evaluated): Checked<boolean> {
  if (!result.ok) return result;
  if (typeof result.value === 'boolean') return { ok: true, value: result.value };
  return { ok: false, class: 'TypeError', message: 'An admission condition must be true or false' };
}

function isFields(value: JsonValue | undefined): value is Readonly<Record<string, JsonValue>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function valueOf(port: PortValue, snapshot: Snapshot): Evaluated {
  if ('lit' in port) return { ok: true, value: port.lit };
  const source = snapshot[port.wire.from];
  const value =
    isFields(source) && Object.hasOwn(source, port.wire.port) ? source[port.wire.port] : undefined;
  return { ok: true, value };
}

function inputsOf(node: FlowNode, snapshot: Snapshot): Checked<Record<string, JsonValue>> {
  const inputs: Record<string, JsonValue> = {};
  for (const [name, port] of Object.entries(node.ports ?? {})) {
    const given = valueOf(port, snapshot);
    if (!given.ok) return given;
    if (given.value !== undefined) inputs[name] = given.value;
  }
  return { ok: true, value: inputs };
}

function nodeResult(node: FlowNode, reads: AdmissionReads, snapshot: Snapshot): NodeResult {
  const at = { id: node.id, key: node.key };
  if (NODE_REGISTRY.get(node.kind)?.class === 'pure') {
    const evaluator = reads.pure(node.kind);
    if (evaluator === undefined) {
      return { ok: false, class: 'NotFound', message: `${node.kind} cannot be evaluated` };
    }
    return evaluator.evaluate({
      kind: node.kind,
      node: at,
      ports: {
        names: Object.keys(node.ports ?? {}),
        get: (name) => {
          const port = node.ports?.[name];
          return port === undefined ? undefined : valueOf(port, snapshot);
        },
      },
    });
  }
  const inputs = inputsOf(node, snapshot);
  if (!inputs.ok) return inputs;
  return reads.port.node({
    kind: node.kind,
    node: at,
    inputs: inputs.value,
    seed: 0,
    activation: node.id,
    ...AUTOMATION_LEVEL,
  });
}

function withReads(reads: AdmissionReads | undefined, snapshot: Snapshot): Checked<Snapshot> {
  if (reads === undefined) return { ok: true, value: snapshot };
  let current = snapshot;
  for (const node of reads.nodes) {
    const result = nodeResult(node, reads, current);
    if (!result.ok) return result;
    current = { ...current, [node.key]: result.value };
  }
  return { ok: true, value: current };
}

export function leadingReads(body: readonly FlowNode[]): readonly FlowNode[] {
  const end = body.findIndex((node) => !LEADING.has(NODE_REGISTRY.get(node.kind)?.class ?? ''));
  return end < 0 ? body : body.slice(0, end);
}

function truthOf(
  snapshot: Snapshot,
  reads: AdmissionReads | undefined,
  port: PortValue,
): Checked<boolean> {
  const visible = withReads(reads, snapshot);
  return visible.ok ? truth(valueOf(port, visible.value)) : visible;
}

export function evaluateCondition(
  parts: AdmissionParts,
  port: PortValue,
  fire: TriggerFire,
): Checked<boolean> {
  return truthOf({ ...parts.roots, ...triggerScope(fire) }, parts.reads, port);
}

export function evaluateAdmission(parts: AdmissionParts, fire: TriggerFire): AdmitVerdict {
  if (parts.admit === undefined) return ADMITTED;
  const checked = evaluateCondition(parts, parts.admit, fire);
  if (!checked.ok) return { admitted: false, failure: checked };
  return checked.value ? ADMITTED : { admitted: false };
}

export function admissionCheck(parts: AdmissionParts, fire: TriggerFire): () => Checked<boolean> {
  return () => {
    const verdict = evaluateAdmission(parts, fire);
    if (verdict.admitted) return { ok: true, value: true };
    if (verdict.failure === undefined) return { ok: true, value: false };
    return { ok: false, ...verdict.failure };
  };
}
