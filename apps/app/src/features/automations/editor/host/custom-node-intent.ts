import type { NodeKindLookup } from '@smarteverything/domain';
import { execClassOf, type FunctionV3, type Layout, type ProgramV4 } from '@smarteverything/domain';
import { extractFromGraph } from '@smarteverything/flow/graph/extract-graph';
import { completeLayout } from '@smarteverything/flow/graph/place-new';
import { execGraphOf, membershipOf } from '@smarteverything/flow/graph/regions';
import { unstructure } from '@smarteverything/flow/graph/unstructure';
import type { FixedReference } from '@smarteverything/flow/extract/boundary';
import { z } from 'zod';
import {
  holderById,
  plural,
  pruneLayout,
  refuse,
  shownDocument,
  type GraphDocument,
  type IntentRuntime,
  type Refusal,
} from './intent-env';

export const PREVIEW_FUNCTION_ID = '00000000-0000-4000-8000-000000000000';
export const PREVIEW_NAME = 'New Custom Node';

export const CUSTOM_NODE_REQUEST = z.strictObject({
  ids: z.array(z.string().min(1)).min(1),
  name: z.string().min(1),
  functionId: z.uuid(),
});

export type CustomNodeRequest = z.infer<typeof CUSTOM_NODE_REQUEST>;

export type CustomNodeCheck =
  { readonly enabled: true } | { readonly enabled: false; readonly reason: string };

export interface CustomNodePlan {
  readonly ok: true;
  readonly callee: FunctionV3;
  readonly instanceKey: string;
  readonly fixed: readonly FixedReference[];
  readonly program: ProgramV4;
  readonly layout: Layout;
  readonly announcement: string;
}

interface Swap {
  readonly key: string;
  readonly id: string;
}

export const REFUSED_PICK = 'Select the steps to turn into a Custom Node.';

function keysOf(program: ProgramV4, ids: readonly string[]): readonly string[] {
  return ids.flatMap((id) => {
    const holder = holderById(program, id);
    return holder === undefined ? [] : [holder.key];
  });
}

function structuralOf(program: ProgramV4, kinds: NodeKindLookup): ReadonlyMap<string, Swap> {
  const byKey = new Map(program.nodes.map((node) => [node.key, node] as const));
  const roles = new Map<string, Swap>();
  for (const node of program.nodes) {
    const execClass = execClassOf(node.kind, kinds);
    if (execClass === 'start' || execClass === 'failure') {
      roles.set(execClass, { key: node.key, id: node.id });
    }
  }
  for (const [fork, joinKey] of membershipOf(execGraphOf(program, kinds)).joinOf) {
    const join = byKey.get(joinKey);
    if (join !== undefined) roles.set(`join:${fork}`, { key: join.key, id: join.id });
  }
  return roles;
}

function swapsOf(
  before: ProgramV4,
  rebuilt: ProgramV4,
  kinds: NodeKindLookup,
): ReadonlyMap<string, Swap> {
  const old = structuralOf(before, kinds);
  const swaps = new Map<string, Swap>();
  for (const [role, fresh] of structuralOf(rebuilt, kinds)) {
    const kept = old.get(role);
    if (kept !== undefined && (kept.key !== fresh.key || kept.id !== fresh.id)) {
      swaps.set(fresh.key, kept);
    }
  }
  return swaps;
}

function retargeted<T extends { readonly to?: string | undefined }>(
  row: T,
  key: (key: string) => string,
): T {
  return row.to === undefined ? row : { ...row, to: key(row.to) };
}

function restoreStructure(before: ProgramV4, rebuilt: ProgramV4, kinds: NodeKindLookup): ProgramV4 {
  const swaps = swapsOf(before, rebuilt, kinds);
  const key = (name: string): string => swaps.get(name)?.key ?? name;
  const nodes = rebuilt.nodes.map((node) => ({
    ...node,
    ...swaps.get(node.key),
    ...(node.to === undefined
      ? {}
      : { to: Object.fromEntries(Object.entries(node.to).map(([port, to]) => [port, key(to)])) }),
    ...(node.branches === undefined
      ? {}
      : { branches: node.branches.map((row) => retargeted(row, key)) }),
    ...(node.cases === undefined ? {} : { cases: node.cases.map((row) => retargeted(row, key)) }),
    ...(node.catches === undefined
      ? {}
      : { catches: node.catches.map((row) => retargeted(row, key)) }),
    ...(node.paths === undefined ? {} : { paths: node.paths.map((row) => retargeted(row, key)) }),
  }));
  return { ...rebuilt, nodes };
}

export function checkCustomNode(
  doc: GraphDocument,
  ids: readonly string[],
  rt: IntentRuntime,
): CustomNodeCheck {
  const keys = keysOf(doc.program, ids);
  if (keys.length === 0) return { enabled: false, reason: REFUSED_PICK };
  const result = extractFromGraph(doc.program, keys, rt.check, {
    functionId: PREVIEW_FUNCTION_ID,
    name: PREVIEW_NAME,
    newId: rt.newId,
  });
  return result.ok ? { enabled: true } : { enabled: false, reason: result.reason };
}

function layoutAfter(
  stored: GraphDocument,
  next: ProgramV4,
  chosen: { readonly instanceKey: string; readonly keys: readonly string[] },
  rt: IntentRuntime,
): Layout {
  const { instanceKey, keys } = chosen;
  const doc = shownDocument(stored, rt);
  const first = doc.program.nodes.find(
    (node) => keys.includes(node.key) && doc.layout.nodes[node.id] !== undefined,
  );
  const call = next.nodes.find((node) => node.key === instanceKey);
  const pruned = pruneLayout(doc.layout, next);
  const spot = first === undefined ? undefined : doc.layout.nodes[first.id];
  const placed =
    call === undefined || spot === undefined
      ? pruned
      : { ...pruned, nodes: { ...pruned.nodes, [call.id]: spot } };
  return completeLayout(next, placed, {
    kinds: rt.kinds,
    direction: rt.direction,
    density: rt.density,
    sizes: rt.sizes,
  });
}

export function planCustomNode(
  doc: GraphDocument,
  request: CustomNodeRequest,
  rt: IntentRuntime,
): CustomNodePlan | Refusal {
  const kinds = rt.kinds;
  const keys = keysOf(doc.program, request.ids);
  if (keys.length === 0) return refuse(REFUSED_PICK);
  const result = extractFromGraph(doc.program, keys, rt.check, {
    functionId: request.functionId,
    name: request.name,
    newId: rt.newId,
  });
  if (!result.ok) return refuse(result.reason);
  const program = restoreStructure(doc.program, unstructure(result.caller, kinds), kinds);
  return {
    ok: true,
    callee: result.callee,
    instanceKey: result.instanceKey,
    fixed: result.fixed,
    program,
    layout: layoutAfter(doc, program, { instanceKey: result.instanceKey, keys }, rt),
    announcement: `Made the Custom Node ${request.name} from ${plural(keys.length, 'step', 'steps')}.`,
  };
}
