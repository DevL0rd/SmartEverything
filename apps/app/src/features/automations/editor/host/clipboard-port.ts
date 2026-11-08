import {
  GRAPH_NODE,
  IDENT,
  NODE_LAYOUT,
  TRIGGER_NODE,
  type GraphNode,
  type NodeKindLookup,
  type Layout,
  type PortValue,
  type ProgramV4,
  type SwitchMatch,
  type TriggerNode,
} from '@smarteverything/domain';
import type { NodeInput, PatchOp } from '@smarteverything/flow/graph/ops/schema';
import { compact } from '@smarteverything/flow/graph/ops/util';
import { uniqueKey } from '@smarteverything/flow/program/keys';
import { Logger } from '@smarteverything/logging';
import * as Clipboard from 'expo-clipboard';
import { z } from 'zod';
import { pickedOf } from './clipboard-pick';
import { plural, refuse, triggersOf } from './intent-env';
import type {
  Applied,
  CanvasPoint,
  PasteOptions,
  GraphDocument,
  IntentRuntime,
  Planned,
  Refusal,
} from './intent-env';

const log = new Logger('app.automations');

export interface ClipboardPort {
  readonly read: () => Promise<string>;
  readonly write: (text: string) => Promise<void>;
}

export const deviceClipboard: ClipboardPort = {
  read: () => Clipboard.getStringAsync(),
  write: async (text) => {
    await Clipboard.setStringAsync(text);
  },
};

export const CLIPBOARD_FORMAT = 'smarteverything.automation-graph';
export const CLIPBOARD_VERSION = 1;
export const PASTE_OFFSET = 32;
export const REFUSED_PASTE = 'The clipboard does not hold automation steps.';
export const REFUSED_COPY = 'Select a step to copy.';

const PAYLOAD = z.strictObject({
  format: z.literal(CLIPBOARD_FORMAT),
  version: z.literal(CLIPBOARD_VERSION),
  nodes: z.array(GRAPH_NODE),
  triggers: z.array(TRIGGER_NODE),
  joins: z.record(IDENT, IDENT),
  layout: z.record(z.string(), NODE_LAYOUT),
});

export type ClipboardPayload = z.infer<typeof PAYLOAD>;

interface Transform {
  readonly key: (key: string) => string;
  readonly id: (id: string) => string;
  readonly target: (key: string) => string | undefined;
  readonly value: (value: PortValue) => PortValue | undefined;
}

const LEFT_BEHIND: PortValue = { lit: false };

function retarget(
  to: Readonly<Record<string, string>> | undefined,
  t: Transform,
): Record<string, string> | undefined {
  const entries = Object.entries(to ?? {}).flatMap(([port, key]) => {
    const mapped = t.target(key);
    return mapped === undefined ? [] : [[port, mapped] as const];
  });
  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

function rowTo(to: string | undefined, t: Transform): { readonly to?: string } {
  const mapped = to === undefined ? undefined : t.target(to);
  return mapped === undefined ? {} : { to: mapped };
}

function mapValues(
  values: Readonly<Record<string, PortValue>>,
  t: Transform,
): Record<string, PortValue> {
  const entries = Object.entries(values).flatMap(([name, value]) => {
    const mapped = t.value(value);
    return mapped === undefined ? [] : [[name, mapped] as const];
  });
  return Object.fromEntries(entries);
}

function matchOf(match: SwitchMatch, t: Transform): SwitchMatch {
  return 'when' in match ? { when: t.value(match.when) ?? LEFT_BEHIND } : match;
}

function casesOf(node: GraphNode, t: Transform): GraphNode['cases'] {
  return node.cases?.map((row) => ({
    id: t.id(row.id),
    match: matchOf(row.match, t),
    ...rowTo(row.to, t),
  }));
}

function rowsOf(node: GraphNode, t: Transform): Pick<GraphNode, 'branches' | 'catches' | 'paths'> {
  return {
    branches: node.branches?.map((row) => ({
      id: t.id(row.id),
      when: t.value(row.when) ?? LEFT_BEHIND,
      ...rowTo(row.to, t),
    })),
    catches: node.catches?.map((row) => ({
      id: t.id(row.id),
      ...(row.classes === undefined ? {} : { classes: row.classes }),
      ...rowTo(row.to, t),
    })),
    paths: node.paths?.map((row) => ({ name: row.name, ...rowTo(row.to, t) })),
  };
}

function outputsOf(node: GraphNode, t: Transform): GraphNode['outputs'] {
  return node.outputs
    ?.map((output) => ({ ...output, values: mapValues(output.values, t) }))
    .filter((output) => Object.keys(output.values).length > 0);
}

function transformNode(node: GraphNode, t: Transform): GraphNode {
  const { to, ports, branches: _b, cases: _c, catches: _k, paths: _p, outputs: _o, ...rest } = node;
  return compact({
    ...rest,
    id: t.id(node.id),
    key: t.key(node.key),
    to: retarget(to, t),
    ports: ports === undefined ? undefined : mapValues(ports, t),
    ...rowsOf(node, t),
    cases: casesOf(node, t),
    outputs: outputsOf(node, t),
  });
}

function transformTrigger(trigger: TriggerNode, t: Transform): TriggerNode {
  return {
    ...trigger,
    id: t.id(trigger.id),
    key: t.key(trigger.key),
    ports: mapValues(trigger.ports, t),
  };
}

function valueReads(node: GraphNode): readonly string[] {
  const values = [
    ...Object.values(node.ports ?? {}),
    ...(node.branches ?? []).map((row) => row.when),
    ...(node.cases ?? []).flatMap((row) => ('when' in row.match ? [row.match.when] : [])),
    ...(node.outputs ?? []).flatMap((output) => Object.values(output.values)),
  ];
  return values.flatMap((value) => ('wire' in value ? [value.wire.from] : []));
}

function producersFirst(nodes: readonly GraphNode[]): readonly GraphNode[] {
  const keys = new Set(nodes.map((node) => node.key));
  const done = new Set<string>();
  const ordered: GraphNode[] = [];
  let rest = [...nodes];
  while (rest.length > 0) {
    const ready = rest.filter((node) =>
      valueReads(node).every((key) => !keys.has(key) || done.has(key) || key === node.key),
    );
    const batch = ready.length > 0 ? ready : rest;
    for (const node of batch) {
      ordered.push(node);
      done.add(node.key);
    }
    rest = rest.filter((node) => !batch.includes(node));
  }
  return ordered;
}

export function buildPayload(
  doc: GraphDocument,
  ids: readonly string[],
  kinds: NodeKindLookup,
): { readonly payload: ClipboardPayload; readonly leftBehind: number } | undefined {
  const picked = pickedOf(doc.program, ids, kinds);
  const keys = new Set([...picked.nodes, ...picked.triggers].map((item) => item.key));
  if (keys.size === 0) return undefined;
  let leftBehind = 0;
  const t: Transform = {
    key: (key) => key,
    id: (id) => id,
    target: (key) => {
      if (keys.has(key)) return key;
      leftBehind += 1;
      return undefined;
    },
    value: (value) => {
      if (!('wire' in value) || keys.has(value.wire.from)) return value;
      leftBehind += 1;
      return undefined;
    },
  };
  const nodes = picked.nodes.map((node) => transformNode(node, t));
  const triggers = picked.triggers.map((trigger) => transformTrigger(trigger, t));
  const everyId = [...nodes, ...triggers].map((item) => item.id);
  const payload = {
    format: CLIPBOARD_FORMAT,
    version: CLIPBOARD_VERSION,
    nodes,
    triggers,
    joins: picked.joins,
    layout: Object.fromEntries(
      everyId.flatMap((id) =>
        doc.layout.nodes[id] === undefined ? [] : [[id, doc.layout.nodes[id]] as const],
      ),
    ),
  } as const;
  return { payload: PAYLOAD.parse(payload), leftBehind };
}

export function parseClipboard(text: string): ClipboardPayload | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    log.debug('clipboard.not_nodes', { reason: String(error) });
    return undefined;
  }
  const parsed = PAYLOAD.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

function countOf(payload: ClipboardPayload): number {
  const joins = new Set(Object.values(payload.joins));
  return payload.nodes.filter((node) => !joins.has(node.key)).length + payload.triggers.length;
}

export function planCopy(
  doc: GraphDocument,
  ids: readonly string[],
  verb: 'Copied' | 'Cut',
  kinds: NodeKindLookup,
): { readonly ok: true; readonly text: string; readonly announcement: string } | Refusal {
  const built = buildPayload(doc, ids, kinds);
  if (built === undefined) return refuse(REFUSED_COPY);
  const left =
    built.leftBehind > 0
      ? ` ${plural(built.leftBehind, 'wire', 'wires')} to steps outside stayed behind.`
      : '';
  return {
    ok: true,
    text: JSON.stringify(built.payload),
    announcement: `${verb} ${plural(countOf(built.payload), 'step', 'steps')}.${left}`,
  };
}

function freshKeys(payload: ClipboardPayload, program: ProgramV4): ReadonlyMap<string, string> {
  const own = [...payload.nodes, ...payload.triggers].map((item) => item.key);
  const used = new Set([...program.nodes, ...triggersOf(program)].map((item) => item.key));
  const reserved = new Set([...used, ...own]);
  const renamed = new Map<string, string>();
  for (const key of own) {
    if (!used.has(key)) continue;
    const fresh = uniqueKey(key, reserved);
    reserved.add(fresh);
    renamed.set(key, fresh);
  }
  return renamed;
}

interface PasteTransform {
  readonly t: Transform;
  readonly ids: ReadonlyMap<string, string>;
}

function pasteTransform(
  payload: ClipboardPayload,
  program: ProgramV4,
  rt: IntentRuntime,
): PasteTransform {
  const renamed = freshKeys(payload, program);
  const ids = new Map<string, string>();
  const keyOf = (key: string): string => renamed.get(key) ?? key;
  const t: Transform = {
    key: keyOf,
    id: (id) => {
      const known = ids.get(id) ?? rt.newId();
      ids.set(id, known);
      return known;
    },
    target: keyOf,
    value: (value) =>
      'wire' in value ? { wire: { from: keyOf(value.wire.from), port: value.wire.port } } : value,
  };
  return { t, ids };
}

function addOps(
  nodes: readonly GraphNode[],
  triggers: readonly TriggerNode[],
  joins: Readonly<Record<string, string>>,
): readonly PatchOp[] {
  const joinKeys = new Set(Object.values(joins));
  const byKey = new Map(nodes.map((node) => [node.key, node] as const));
  const adds = producersFirst(nodes.filter((node) => !joinKeys.has(node.key))).flatMap(
    (node): PatchOp[] => {
      const joinKey = joins[node.key];
      const join = joinKey === undefined ? undefined : byKey.get(joinKey);
      const input: NodeInput = node;
      const base: PatchOp = {
        op: 'add',
        node: input,
        ...(join === undefined ? {} : { join: { key: join.key, id: join.id } }),
      };
      return [base, ...joinOps(join)];
    },
  );
  return [...triggers.map((trigger): PatchOp => ({ op: 'add', node: trigger })), ...adds];
}

function joinOps(join: GraphNode | undefined): readonly PatchOp[] {
  if (join === undefined) return [];
  const next = join.to?.['next'];
  const wire: readonly PatchOp[] =
    next === undefined ? [] : [{ op: 'connect', from: join.key, port: 'next', to: next }];
  const text = compact({
    op: 'set',
    key: join.key,
    label: join.label,
    note: join.note,
    enabled: join.enabled,
  } as const);
  return Object.keys(text).length > 2 ? [...wire, text] : wire;
}

function shifted(payload: ClipboardPayload, at: CanvasPoint | undefined): CanvasPoint {
  const spots = Object.values(payload.layout);
  if (at === undefined || spots.length === 0) return { x: PASTE_OFFSET, y: PASTE_OFFSET };
  return {
    x: at.x - Math.min(...spots.map((spot) => spot.x)),
    y: at.y - Math.min(...spots.map((spot) => spot.y)),
  };
}

function placedAt(
  payload: ClipboardPayload,
  ids: ReadonlyMap<string, string>,
  at: CanvasPoint | undefined,
): (applied: Applied, layout: Layout) => Layout {
  const delta = shifted(payload, at);
  return (_applied: Applied, layout: Layout): Layout => {
    const nodes = { ...layout.nodes };
    for (const [oldId, spot] of Object.entries(payload.layout)) {
      const id = ids.get(oldId);
      if (id !== undefined) nodes[id] = { ...spot, x: spot.x + delta.x, y: spot.y + delta.y };
    }
    return { ...layout, nodes };
  };
}

export function planPasteOf(
  doc: GraphDocument,
  payload: ClipboardPayload,
  rt: IntentRuntime,
  options: PasteOptions,
): Planned {
  const { t, ids } = pasteTransform(payload, doc.program, rt);
  const nodes = payload.nodes.map((node) => transformNode(node, t));
  const triggers = payload.triggers.map((trigger) => transformTrigger(trigger, t));
  const joins = Object.fromEntries(
    Object.entries(payload.joins).map(([fork, join]) => [t.key(fork), t.key(join)]),
  );
  return {
    ok: true,
    ops: [...addOps(nodes, triggers, joins), ...(options.attach?.(nodes, t.key) ?? [])],
    layout: placedAt(payload, ids, options.at),
    select: () => [...nodes, ...triggers].map((item) => item.id),
    message: () => ({
      announcement: `${options.verb} ${plural(countOf(payload), 'step', 'steps')}.`,
    }),
  };
}

export function planPaste(
  doc: GraphDocument,
  text: string,
  at: CanvasPoint | undefined,
  rt: IntentRuntime,
): Planned {
  const payload = parseClipboard(text);
  if (payload === undefined) return refuse(REFUSED_PASTE);
  return planPasteOf(doc, payload, rt, { at, verb: 'Pasted' });
}

export function planDuplicate(
  doc: GraphDocument,
  ids: readonly string[],
  rt: IntentRuntime,
): Planned {
  const built = buildPayload(doc, ids, rt.kinds);
  if (built === undefined) return refuse(REFUSED_COPY);
  return planPasteOf(doc, built.payload, rt, { verb: 'Duplicated' });
}
