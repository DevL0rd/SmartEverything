import type {
  FlowNode,
  FlowType,
  InputPort,
  InputPortDecl,
  NodeKind,
  OutputPort,
  OutputPortDecl,
  RefKind,
  ReservedRoot,
} from '@smarteverything/domain';
import { functionIdOf, pinOf } from '../functions/calls';
import type { FunctionInterface } from '../functions/interface-hash';
import type { Entry, ProgramIndex } from '../program/lookup';
import type { Program } from '../program/walk';

export type PortTypes = Readonly<Record<string, FlowType>>;

export type OutputMap = ReadonlyMap<string, PortTypes>;

export type RootTypes = Readonly<Partial<Record<ReservedRoot, FlowType>>>;

export type CheckKind = Pick<NodeKind, 'id' | 'class' | 'inputs' | 'outputs'>;

export interface AutomationInterface {
  readonly inputs: readonly InputPort[];
  readonly outputs: readonly OutputPort[];
}

export interface CheckContext {
  readonly kinds: (id: string) => CheckKind | undefined;
  readonly automations: (id: string) => AutomationInterface | undefined;
  readonly scopeOutputs: (kind: string) => readonly OutputPortDecl[];
  readonly references: (kind: RefKind, id: string) => boolean;
  readonly functions: (id: string, pin: number | undefined) => FunctionInterface | undefined;
  readonly secrets: ReadonlySet<string>;
}

export interface NodeShape {
  readonly inputs: readonly InputPortDecl[];
  readonly outputs: readonly OutputPortDecl[];
  readonly open: boolean;
}

export interface TypedProgram {
  readonly roots: RootTypes;
  readonly outputs: OutputMap;
}

export function entriesOf(index: ProgramIndex): readonly Entry[] {
  const { program } = index;
  const triggers = program.kind === 'automation' ? program.triggers : [];
  return [
    ...triggers.map((node, position): Entry => ({
      kind: 'trigger',
      node,
      index: position,
      storage: ['triggers', position],
    })),
    ...index.nodes,
  ];
}

function inputDeclOf(port: InputPort): InputPortDecl {
  return {
    name: port.name,
    type: port.type,
    required: port.required && port.default === undefined,
    ...(port.default === undefined ? {} : { default: port.default }),
    description: port.description ?? '',
  };
}

function outputDeclOf(port: OutputPort): OutputPortDecl {
  return {
    name: port.name,
    type: port.type,
    ...(port.optional === true ? { optional: true } : {}),
    description: port.description ?? '',
  };
}

function calleeShape(base: NodeShape, callee: AutomationInterface | undefined): NodeShape {
  if (callee === undefined) return { ...base, open: true };
  return {
    inputs: [...base.inputs, ...callee.inputs.map(inputDeclOf)],
    outputs: [...base.outputs, ...callee.outputs.map(outputDeclOf)],
    open: false,
  };
}

function callShape(node: FlowNode, base: NodeShape, ctx: CheckContext): NodeShape {
  const id = functionIdOf(node);
  return calleeShape(base, id === undefined ? undefined : ctx.functions(id, pinOf(node)));
}

const CHECKED_AT_START: FlowType = { t: 'any' };

function runShape(node: FlowNode, base: NodeShape, ctx: CheckContext): NodeShape {
  const target = node.ports?.['automation'];
  const id = target !== undefined && 'lit' in target ? target.lit : undefined;
  const callee = typeof id === 'string' ? ctx.automations(id) : undefined;
  const wait = node.ports?.['wait'];
  const waits = wait !== undefined && 'lit' in wait && wait.lit === true;
  return calleeShape(
    base,
    callee === undefined
      ? undefined
      : {
          inputs: callee.inputs.map((port) => ({ ...port, type: CHECKED_AT_START })),
          outputs: waits ? callee.outputs : [],
        },
  );
}

export function shapeOf(entry: Entry, program: Program, ctx: CheckContext): NodeShape | undefined {
  const kind = ctx.kinds(entry.node.kind);
  if (kind === undefined) return undefined;
  const base: NodeShape = { inputs: kind.inputs, outputs: kind.outputs, open: false };
  if (kind.id === 'fn.call' && entry.kind === 'node') return callShape(entry.node, base, ctx);
  if (kind.id === 'automation.run' && entry.kind === 'node') return runShape(entry.node, base, ctx);
  if (kind.id === 'flow.return') {
    const returned = program.outputs.map((port) =>
      inputDeclOf({ ...port, required: port.optional !== true }),
    );
    return { ...base, inputs: [...base.inputs, ...returned] };
  }
  return kind.id === 'trigger.called'
    ? { ...base, outputs: program.inputs.map(outputDeclOf) }
    : base;
}
