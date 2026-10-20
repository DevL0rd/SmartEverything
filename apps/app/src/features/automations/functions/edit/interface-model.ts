import type { FunctionV3, FlowNode, InputPort, OutputPort } from '@smarteverything/domain';
import { DEFAULT_EXIT } from '@smarteverything/flow/extract/control';
import { rewriteProgram } from '@smarteverything/flow/functions/rewrite';
import { walkProgram } from '@smarteverything/flow/program/walk';

export type PortSide = 'inputs' | 'outputs';

export type InterfaceEdit =
  | { readonly op: 'put-input'; readonly port: InputPort }
  | { readonly op: 'put-output'; readonly port: OutputPort }
  | { readonly op: 'remove-port'; readonly side: PortSide; readonly name: string }
  | { readonly op: 'reorder'; readonly side: PortSide | 'exits'; readonly order: readonly string[] }
  | { readonly op: 'add-exit'; readonly name: string }
  | { readonly op: 'remove-exit'; readonly name: string; readonly routeTo?: string };

export type EditRefusal = 'last-exit' | 'needs-route' | 'unknown' | 'bad-order' | 'duplicate';

export type EditOutcome =
  | { readonly ok: true; readonly program: FunctionV3 }
  | {
      readonly ok: false;
      readonly reason: EditRefusal;
      readonly message: string;
      readonly returns: readonly string[];
    };

function refuse(
  reason: EditRefusal,
  message: string,
  returns: readonly string[] = [],
): EditOutcome {
  return { ok: false, reason, message, returns };
}

function exitOf(node: FlowNode): string {
  const port = node.ports?.['exit'];
  return port !== undefined && 'lit' in port && typeof port.lit === 'string'
    ? port.lit
    : DEFAULT_EXIT;
}

export function returnsUsing(program: FunctionV3, exit: string): readonly string[] {
  return walkProgram(program)
    .filter(({ node }) => node.kind === 'flow.return' && exitOf(node) === exit)
    .map(({ node }) => node.key);
}

function rerouted(program: FunctionV3, from: string, to: string): FunctionV3 {
  return rewriteProgram(program, {
    wire: (wire) => wire,
    node: (node) =>
      node.kind === 'flow.return' && exitOf(node) === from
        ? { ...node, ports: { ...node.ports, exit: { lit: to } } }
        : node,
  });
}

function upsert<T extends { readonly name: string }>(list: readonly T[], item: T): readonly T[] {
  return list.some((entry) => entry.name === item.name)
    ? list.map((entry) => (entry.name === item.name ? item : entry))
    : [...list, item];
}

function reordered<T>(
  list: readonly T[],
  nameOf: (item: T) => string,
  order: readonly string[],
): readonly T[] | null {
  const names = list.map(nameOf);
  const valid =
    order.length === names.length &&
    new Set(order).size === names.length &&
    order.every((name) => names.includes(name));
  if (!valid) return null;
  return order.flatMap((name) => list.filter((item) => nameOf(item) === name));
}

function reorder(
  program: FunctionV3,
  edit: Extract<InterfaceEdit, { op: 'reorder' }>,
): EditOutcome {
  const failed = refuse('bad-order', 'The new order must list every row once.');
  if (edit.side === 'exits') {
    const exits = reordered(program.exits, (name) => name, edit.order);
    return exits === null ? failed : { ok: true, program: { ...program, exits: [...exits] } };
  }
  if (edit.side === 'inputs') {
    const inputs = reordered(program.inputs, (port) => port.name, edit.order);
    return inputs === null ? failed : { ok: true, program: { ...program, inputs: [...inputs] } };
  }
  const outputs = reordered(program.outputs, (port) => port.name, edit.order);
  return outputs === null ? failed : { ok: true, program: { ...program, outputs: [...outputs] } };
}

function removeExit(
  program: FunctionV3,
  edit: Extract<InterfaceEdit, { op: 'remove-exit' }>,
): EditOutcome {
  if (!program.exits.includes(edit.name))
    return refuse('unknown', `There is no exit ${edit.name}.`);
  if (program.exits.length === 1) {
    return refuse('last-exit', 'A Custom Node needs at least one exit.');
  }
  const exits = program.exits.filter((name) => name !== edit.name);
  const returns = returnsUsing(program, edit.name);
  if (returns.length === 0) return { ok: true, program: { ...program, exits } };
  if (edit.routeTo === undefined || !exits.includes(edit.routeTo)) {
    return refuse('needs-route', `Choose the exit those Return steps use instead.`, returns);
  }
  return { ok: true, program: { ...rerouted(program, edit.name, edit.routeTo), exits } };
}

function removePort(program: FunctionV3, side: PortSide, name: string): EditOutcome {
  const list: readonly { readonly name: string }[] = program[side];
  if (!list.some((port) => port.name === name)) {
    return refuse('unknown', `There is no ${side === 'inputs' ? 'input' : 'output'} ${name}.`);
  }
  return side === 'inputs'
    ? { ok: true, program: { ...program, inputs: program.inputs.filter((p) => p.name !== name) } }
    : {
        ok: true,
        program: { ...program, outputs: program.outputs.filter((p) => p.name !== name) },
      };
}

export function applyInterfaceEdit(program: FunctionV3, edit: InterfaceEdit): EditOutcome {
  switch (edit.op) {
    case 'put-input':
      return { ok: true, program: { ...program, inputs: [...upsert(program.inputs, edit.port)] } };
    case 'put-output':
      return {
        ok: true,
        program: { ...program, outputs: [...upsert(program.outputs, edit.port)] },
      };
    case 'remove-port':
      return removePort(program, edit.side, edit.name);
    case 'reorder':
      return reorder(program, edit);
    case 'add-exit':
      return program.exits.includes(edit.name)
        ? refuse('duplicate', `There is already an exit ${edit.name}.`)
        : { ok: true, program: { ...program, exits: [...program.exits, edit.name] } };
    case 'remove-exit':
      return removeExit(program, edit);
  }
}
