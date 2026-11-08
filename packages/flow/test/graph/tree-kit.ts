import type {
  Branch,
  CatchRow,
  FlowNode,
  FunctionV3,
  JsonValue,
  PortValue,
  Scope,
} from '@smarteverything/domain';

export { wire } from '@smarteverything/domain';

export const lit = (value: JsonValue): PortValue => ({ lit: value });

export interface TreeKit {
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

export function kit(group: number): TreeKit {
  let counter = 0;
  const id = (): string => {
    counter += 1;
    const tail = counter.toString(16).padStart(12, '0');
    return `b0000000-${group.toString(16).padStart(4, '0')}-4000-8000-${tail}`;
  };
  const scope = (nodes: FlowNode[]): Scope => ({ nodes });
  const node: TreeKit['node'] = (key, kind, ports, extra = {}) => ({
    id: id(),
    key,
    kind,
    ...(ports === undefined ? {} : { ports }),
    ...extra,
  });
  const when: TreeKit['when'] = (key, condition, then, otherwise) => {
    const branch: Branch = { id: id(), when: condition, scope: scope(then) };
    return node(key, 'flow.if', undefined, {
      branches: [branch],
      ...(otherwise === undefined ? {} : { scopes: { else: scope(otherwise) } }),
    });
  };
  const attempt: TreeKit['attempt'] = (key, body, classes, recovery) =>
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
}

export function action(shape: ActionShape, body: readonly FlowNode[]): FunctionV3 {
  return {
    version: 3,
    kind: 'function',
    flavour: 'action',
    ...shape,
    inputs: [],
    outputs: [],
    exits: ['done'],
    variables: [],
    body: { nodes: [...body] },
  };
}
