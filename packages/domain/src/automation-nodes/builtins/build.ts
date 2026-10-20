import type { JsonValue } from '../../values';
import type {
  Branch,
  CatchRow,
  FlowNode,
  InputPort,
  OutputPort,
  Scope,
  Variable,
} from '../../automation-v3/node';
import type { FlowType } from '../../automation-v3/types';
import type { FunctionV3 } from '../../automation-v3/program';
import type { PortValue } from '../../automation-v3/port-value';

export interface BuiltinFunction {
  readonly id: string;
  readonly revision: number;
  readonly name: string;
  readonly program: FunctionV3;
}

export const lit = (value: JsonValue): PortValue => ({ lit: value });

export { wire } from '../../automation-v3/port-value';

export const NUMBER: FlowType = { t: 'number' };
export const COUNT: FlowType = { t: 'number', integer: true, min: 0 };
export const FLAG: FlowType = { t: 'boolean' };
export const TEXT: FlowType = { t: 'text' };
export const TARGET: FlowType = { t: 'ref', of: 'target' };
export const PEOPLE: FlowType = { t: 'list', of: { t: 'ref', of: 'person' } };

export function required(name: string, type: FlowType, description: string): InputPort {
  return { name, type, required: true, description };
}

export function optional(
  name: string,
  type: FlowType,
  description: string,
  standard?: JsonValue,
): InputPort {
  return {
    name,
    type,
    required: false,
    description,
    ...(standard === undefined ? {} : { default: standard }),
  };
}

export function output(name: string, type: FlowType, description: string): OutputPort {
  return { name, type, description };
}

export function variable(name: string, type: FlowType, initial: PortValue): Variable {
  return { name, type, initial };
}

export interface Kit {
  readonly node: (
    key: string,
    kind: string,
    ports?: Record<string, PortValue>,
    extra?: Partial<FlowNode>,
  ) => FlowNode;
  readonly when: (
    key: string,
    condition: PortValue,
    then: FlowNode[],
    otherwise?: FlowNode[],
  ) => FlowNode;
  readonly attempt: (
    key: string,
    body: FlowNode[],
    classes: CatchRow['classes'],
    recovery: FlowNode[],
  ) => FlowNode;
}

export function kit(group: number): Kit {
  let counter = 0;
  const id = (): string => {
    counter += 1;
    const tail = counter.toString(16).padStart(12, '0');
    return `b0000000-${group.toString(16).padStart(4, '0')}-4000-8000-${tail}`;
  };
  const scope = (nodes: FlowNode[]): Scope => ({ nodes });
  const node: Kit['node'] = (key, kind, ports, extra = {}) => ({
    id: id(),
    key,
    kind,
    ...(ports === undefined ? {} : { ports }),
    ...extra,
  });
  const when: Kit['when'] = (key, condition, then, otherwise) => {
    const branch: Branch = { id: id(), when: condition, scope: scope(then) };
    return node(key, 'flow.if', undefined, {
      branches: [branch],
      ...(otherwise === undefined ? {} : { scopes: { else: scope(otherwise) } }),
    });
  };
  const attempt: Kit['attempt'] = (key, body, classes, recovery) =>
    node(key, 'flow.try', undefined, {
      scopes: { try: scope(body) },
      catches: [
        { id: id(), ...(classes === undefined ? {} : { classes }), scope: scope(recovery) },
      ],
    });
  return { node, when, attempt };
}

export interface ActionShape {
  readonly description: string;
  readonly category: string;
  readonly icon: string;
  readonly inputs: readonly InputPort[];
  readonly outputs: readonly OutputPort[];
  readonly variables?: readonly Variable[];
  readonly exits?: readonly string[];
  readonly body: readonly FlowNode[];
}

export function action(shape: ActionShape): FunctionV3 {
  return {
    version: 3,
    kind: 'function',
    flavour: 'action',
    description: shape.description,
    category: shape.category,
    icon: shape.icon,
    inputs: [...shape.inputs],
    outputs: [...shape.outputs],
    exits: [...(shape.exits ?? ['done'])],
    variables: [...(shape.variables ?? [])],
    body: { nodes: [...shape.body] },
  };
}

export function builtin(
  name: string,
  revision: number,
  title: string,
  program: FunctionV3,
): BuiltinFunction {
  return { id: `builtin.${name}`, revision, name: title, program };
}
