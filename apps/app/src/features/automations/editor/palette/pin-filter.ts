import {
  execClassOf,
  execPortsOf,
  isAssignable,
  isExecNode,
  type FlowType,
  type NodeKindLookup,
  type ProgramV4,
} from '@smarteverything/domain';
import { LOOP_KINDS } from '@smarteverything/flow/check/lint-scan';
import {
  execGraphOf,
  laneRegionId,
  membershipOf,
  outputsOf,
} from '@smarteverything/flow/graph/regions';
import {
  execInHandle,
  execOutHandle,
  parseHandle,
  valueInHandle,
  valueOutHandle,
} from '../../model/graph/handle-ids';
import type { EdgeEnd } from '../../model/graph/scene-contract';
import type { ConnectRequest } from '../host/connect-intent';
import type { InsertRequest } from '../host/insert-intent';
import type { PaletteEntry } from './palette-categories';
import { STEP_CONTEXT, type PaletteContext } from './palette-search';

export interface ExecPin {
  readonly kind: 'exec';
  readonly nodeId: string;
  readonly nodeKey: string;
  readonly port: string;
}

export interface ValuePin {
  readonly kind: 'value';
  readonly nodeId: string;
  readonly handle: string;
  readonly expected: FlowType | null;
}

export interface ValueOutPin {
  readonly kind: 'valueOut';
  readonly nodeId: string;
  readonly handle: string;
  readonly given: FlowType | null;
}

export interface ExecInPin {
  readonly kind: 'execIn';
  readonly nodeId: string;
  readonly handle: string;
}

export type PinSource = ExecPin | ValuePin | ValueOutPin | ExecInPin;

export type PinLink =
  | { readonly t: 'out'; readonly output: string; readonly target: EdgeEnd }
  | { readonly t: 'in'; readonly source: EdgeEnd; readonly input: string }
  | { readonly t: 'exec'; readonly exit: string; readonly target: EdgeEnd };

export interface PinInsertion {
  readonly insert: InsertRequest;
  readonly link: PinLink | undefined;
}

const BOOLEAN: FlowType = { t: 'boolean' };

export function execPinOf(
  program: ProgramV4,
  nodeId: string,
  port: string,
  kinds: NodeKindLookup,
): ExecPin | undefined {
  const node = program.nodes.find((item) => item.id === nodeId);
  if (
    node === undefined ||
    !outputsOf(execGraphOf(program, kinds), node.key).some((out) => out.port === port)
  ) {
    return undefined;
  }
  return { kind: 'exec', nodeId, nodeKey: node.key, port };
}

function expectedAt(
  program: ProgramV4,
  nodeId: string,
  handle: string,
  kinds: NodeKindLookup,
): FlowType | null | undefined {
  const node = program.nodes.find((item) => item.id === nodeId);
  const ref = parseHandle(handle);
  if (node === undefined || ref === undefined) return undefined;
  if (ref.kind === 'condition') return BOOLEAN;
  if (ref.kind !== 'valueIn') return undefined;
  if (node.kind === 'flow.start' && ref.port === 'admit') return BOOLEAN;
  const decl = kinds.get(node.kind)?.inputs.find((input) => input.name === ref.port);
  return decl?.type;
}

export function valuePinOf(
  program: ProgramV4,
  nodeId: string,
  handle: string,
  kinds: NodeKindLookup,
): ValuePin | undefined {
  const expected = expectedAt(program, nodeId, handle, kinds);
  return expected === undefined ? undefined : { kind: 'value', nodeId, handle, expected };
}

function valueOutPinOf(
  program: ProgramV4,
  nodeId: string,
  name: string,
  kinds: NodeKindLookup,
): ValueOutPin | undefined {
  const node = program.nodes.find((item) => item.id === nodeId);
  if (node === undefined) return undefined;
  const given = kinds.get(node.kind)?.outputs.find((out) => out.name === name)?.type ?? null;
  return { kind: 'valueOut', nodeId, handle: valueOutHandle(name), given };
}

function execInPinOf(
  program: ProgramV4,
  nodeId: string,
  kinds: NodeKindLookup,
): ExecInPin | undefined {
  const node = program.nodes.find((item) => item.id === nodeId);
  if (node === undefined || !execPortsOf(node.kind, node, kinds).input) return undefined;
  return { kind: 'execIn', nodeId, handle: execInHandle() };
}

export function dropPinOf(
  program: ProgramV4,
  from: EdgeEnd,
  kinds: NodeKindLookup,
): PinSource | undefined {
  const ref = parseHandle(from.handle);
  switch (ref?.kind) {
    case 'execOut':
      return execPinOf(program, from.nodeId, ref.port, kinds);
    case 'valueOut':
      return valueOutPinOf(program, from.nodeId, ref.name, kinds);
    case 'execIn':
      return execInPinOf(program, from.nodeId, kinds);
    case 'valueIn':
    case 'condition':
      return valuePinOf(program, from.nodeId, from.handle, kinds);
    case undefined:
      return undefined;
  }
}

function isStepEntry(entry: PaletteEntry, kinds: NodeKindLookup): boolean {
  if (entry.trigger) return false;
  return entry.kindId === null || isExecNode(entry.kindId, kinds);
}

function isValueEntry(
  entry: PaletteEntry,
  expected: FlowType | null,
  kinds: NodeKindLookup,
): boolean {
  if (entry.kindId === null || entry.trigger || execClassOf(entry.kindId, kinds) !== 'value') {
    return false;
  }
  if (expected === null) return entry.gives.length > 0;
  return entry.gives.some((type) => isAssignable(type, expected));
}

function firstExit(kindId: string, kinds: NodeKindLookup): string | undefined {
  return execPortsOf(kindId, undefined, kinds).outputs[0]?.port;
}

function inputFor(
  kindId: string,
  given: FlowType | null,
  kinds: NodeKindLookup,
): string | undefined {
  const inputs = kinds.get(kindId)?.inputs ?? [];
  if (given === null) return inputs[0]?.name;
  return inputs.find((input) => isAssignable(given, input.type))?.name;
}

function isTakerEntry(entry: PaletteEntry, given: FlowType | null, kinds: NodeKindLookup): boolean {
  if (entry.kindId === null || entry.trigger) return false;
  return inputFor(entry.kindId, given, kinds) !== undefined;
}

function isFeederEntry(entry: PaletteEntry, kinds: NodeKindLookup): boolean {
  if (entry.kindId === null || entry.trigger || !isExecNode(entry.kindId, kinds)) return false;
  return firstExit(entry.kindId, kinds) !== undefined;
}

function fitsPin(entry: PaletteEntry, pin: PinSource, kinds: NodeKindLookup): boolean {
  switch (pin.kind) {
    case 'exec':
      return isStepEntry(entry, kinds);
    case 'value':
      return isValueEntry(entry, pin.expected, kinds);
    case 'valueOut':
      return isTakerEntry(entry, pin.given, kinds);
    case 'execIn':
      return isFeederEntry(entry, kinds);
  }
}

export function filterEntriesForPin(
  entries: readonly PaletteEntry[],
  pin: PinSource,
  kinds: NodeKindLookup,
): readonly PaletteEntry[] {
  return entries.filter((entry) => fitsPin(entry, pin, kinds));
}

function regionIdOf(program: ProgramV4, pin: ExecPin, kinds: NodeKindLookup): string | undefined {
  const graph = execGraphOf(program, kinds);
  const out = outputsOf(graph, pin.nodeKey).find((item) => item.port === pin.port);
  if (out?.role === 'lane') return laneRegionId(pin.nodeKey, pin.port);
  return membershipOf(graph).regionOf.get(pin.nodeKey);
}

function insideLoop(program: ProgramV4, pin: ExecPin, kinds: NodeKindLookup): boolean {
  const graph = execGraphOf(program, kinds);
  const { regions } = membershipOf(graph);
  const first = regionIdOf(program, pin, kinds);
  for (let region = first === undefined ? undefined : regions.get(first); region !== undefined;) {
    const owner = region.owner === undefined ? undefined : graph.byKey.get(region.owner);
    if (owner !== undefined && LOOP_KINDS.has(owner.kind)) return true;
    region = region.parent === undefined ? undefined : regions.get(region.parent);
  }
  return false;
}

export function pinContext(
  program: ProgramV4,
  pin: PinSource,
  kinds: NodeKindLookup,
): PaletteContext {
  switch (pin.kind) {
    case 'value':
      return { slot: 'value', expected: pin.expected, inLoop: false, afterTrigger: false };
    case 'exec':
      return { ...STEP_CONTEXT, inLoop: insideLoop(program, pin, kinds) };
    case 'valueOut':
    case 'execIn':
      return STEP_CONTEXT;
  }
}

export function outputFor(
  kindId: string,
  expected: FlowType | null,
  kinds: NodeKindLookup,
): string | undefined {
  const outputs = kinds.get(kindId)?.outputs ?? [];
  if (expected === null) return outputs[0]?.name;
  return outputs.find((out) => isAssignable(out.type, expected))?.name;
}

function linkFor(
  pin: Exclude<PinSource, ExecPin>,
  kindId: string,
  kinds: NodeKindLookup,
): PinLink | undefined {
  const at = { nodeId: pin.nodeId, handle: pin.handle };
  switch (pin.kind) {
    case 'value': {
      const output = outputFor(kindId, pin.expected, kinds);
      return output === undefined ? undefined : { t: 'out', output, target: at };
    }
    case 'valueOut': {
      const input = inputFor(kindId, pin.given, kinds);
      return input === undefined ? undefined : { t: 'in', source: at, input };
    }
    case 'execIn': {
      const exit = firstExit(kindId, kinds);
      return exit === undefined ? undefined : { t: 'exec', exit, target: at };
    }
  }
}

export function pinInsertion(
  pin: PinSource,
  kindId: string,
  kinds: NodeKindLookup,
  point?: { readonly x: number; readonly y: number },
): PinInsertion | undefined {
  const where = point === undefined ? {} : { point };
  if (pin.kind === 'exec') {
    return {
      insert: { kind: kindId, after: { nodeId: pin.nodeId, port: pin.port }, ...where },
      link: undefined,
    };
  }
  const link = linkFor(pin, kindId, kinds);
  return link === undefined ? undefined : { insert: { kind: kindId, ...where }, link };
}

export function linkRequest(link: PinLink, newNodeId: string): ConnectRequest {
  switch (link.t) {
    case 'out':
      return { from: { nodeId: newNodeId, handle: valueOutHandle(link.output) }, to: link.target };
    case 'in':
      return { from: link.source, to: { nodeId: newNodeId, handle: valueInHandle(link.input) } };
    case 'exec':
      return { from: { nodeId: newNodeId, handle: execOutHandle(link.exit) }, to: link.target };
  }
}
