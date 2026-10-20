import type { FlowNode, PortValue } from '@smarteverything/domain';
import { indexProgram } from '@smarteverything/flow/program/lookup';
import type { Entry } from '@smarteverything/flow/program/lookup';
import { uniqueKey, usedKeys } from '@smarteverything/flow/program/keys';
import { formatScopePath } from '@smarteverything/flow/program/paths';
import { childScopeRefs } from '@smarteverything/flow/program/walk';
import type { Program } from '@smarteverything/flow/program/walk';
import type { NodeInput, PatchOp, ScopeInput } from '@smarteverything/flow/ops/schema';
import { NODE_INPUT, TRIGGERS_TARGET } from '@smarteverything/flow/ops/schema';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';

const log = new Logger('app.automations');

export const CLIPBOARD_FORMAT = 'smarteverything.automation-nodes';
export const CLIPBOARD_VERSION = 1;

export interface ClipboardEntry {
  readonly trigger: boolean;
  readonly node: NodeInput;
}

export interface ClipboardPayload {
  readonly format: typeof CLIPBOARD_FORMAT;
  readonly version: typeof CLIPBOARD_VERSION;
  readonly entries: readonly ClipboardEntry[];
}

export interface PasteTarget {
  readonly in: string;
  readonly after?: string | undefined;
  readonly index?: number | undefined;
}

interface Place {
  readonly after?: string;
  readonly index?: number;
}

export interface PasteResult {
  readonly ops: readonly PatchOp[];
  readonly keys: ReadonlyMap<string, string>;
}

const PAYLOAD = z.strictObject({
  format: z.literal(CLIPBOARD_FORMAT),
  version: z.literal(CLIPBOARD_VERSION),
  entries: z.array(z.strictObject({ trigger: z.boolean(), node: NODE_INPUT })).min(1),
});

function stripNode(node: FlowNode): void {
  Reflect.deleteProperty(node, 'id');
  const rows = [...(node.branches ?? []), ...(node.cases ?? []), ...(node.catches ?? [])];
  for (const row of rows) Reflect.deleteProperty(row, 'id');
  for (const ref of childScopeRefs(node, [])) ref.scope.nodes.forEach(stripNode);
}

function inputOf(entry: Entry): ClipboardEntry {
  const clone = structuredClone(entry.node);
  if (entry.kind === 'trigger') {
    Reflect.deleteProperty(clone, 'id');
    return { trigger: true, node: NODE_INPUT.parse(clone) };
  }
  stripNode(clone);
  return { trigger: false, node: NODE_INPUT.parse(clone) };
}

function topLevel(program: Program, ids: readonly string[]): readonly Entry[] {
  const index = indexProgram(program);
  const chosen = new Set(ids);
  const selected = [...index.byId.values()].filter((entry) => chosen.has(entry.node.id));
  const keys = new Set(selected.map((entry) => entry.node.key));
  return selected.filter(
    (entry) => entry.kind === 'trigger' || !entry.ancestors.some((key) => keys.has(key)),
  );
}

export function payloadOf(entries: readonly ClipboardEntry[]): ClipboardPayload {
  return { format: CLIPBOARD_FORMAT, version: CLIPBOARD_VERSION, entries };
}

export function entriesOfNodes(nodes: readonly FlowNode[]): readonly ClipboardEntry[] {
  return nodes.map((node): ClipboardEntry => {
    const clone = structuredClone(node);
    stripNode(clone);
    return { trigger: false, node: NODE_INPUT.parse(clone) };
  });
}

export function copyPayload(
  program: Program,
  ids: readonly string[],
): ClipboardPayload | undefined {
  const entries = topLevel(program, ids).map(inputOf);
  if (entries.length === 0) return undefined;
  return payloadOf(entries);
}

export function serializeClipboard(payload: ClipboardPayload): string {
  return JSON.stringify(payload);
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

function scopesOf(node: NodeInput): readonly ScopeInput[] {
  return [
    ...(node.branches ?? []).map((row) => row.scope),
    ...(node.cases ?? []).map((row) => row.scope),
    ...(node.catches ?? []).map((row) => row.scope),
    ...Object.values(node.scopes ?? {}),
  ];
}

function keysIn(node: NodeInput): readonly string[] {
  const own = node.key === undefined ? [] : [node.key];
  return [...own, ...scopesOf(node).flatMap((scope) => scope.nodes.flatMap(keysIn))];
}

function rewriteValue(value: PortValue, keys: ReadonlyMap<string, string>): PortValue {
  if (!('wire' in value)) return value;
  const to = keys.get(value.wire.from);
  return to === undefined ? value : { wire: { from: to, port: value.wire.port } };
}

function rewriteScope(scope: ScopeInput, keys: ReadonlyMap<string, string>): ScopeInput {
  return { nodes: scope.nodes.map((node) => rewriteNode(node, keys)) };
}

function mapValues(
  table: Record<string, PortValue>,
  keys: ReadonlyMap<string, string>,
): Record<string, PortValue> {
  return Object.fromEntries(
    Object.entries(table).map(([name, value]) => [name, rewriteValue(value, keys)]),
  );
}

function rewriteNode(node: NodeInput, keys: ReadonlyMap<string, string>): NodeInput {
  const next: NodeInput = { ...node };
  if (node.key !== undefined) next.key = keys.get(node.key) ?? node.key;
  if (node.ports !== undefined) next.ports = mapValues(node.ports, keys);
  if (node.branches !== undefined) {
    next.branches = node.branches.map((row) => ({
      ...row,
      when: rewriteValue(row.when, keys),
      scope: rewriteScope(row.scope, keys),
    }));
  }
  if (node.cases !== undefined) {
    next.cases = node.cases.map((row) => ({
      ...row,
      match: 'when' in row.match ? { when: rewriteValue(row.match.when, keys) } : row.match,
      scope: rewriteScope(row.scope, keys),
    }));
  }
  if (node.catches !== undefined) {
    next.catches = node.catches.map((row) => ({ ...row, scope: rewriteScope(row.scope, keys) }));
  }
  if (node.scopes !== undefined) {
    next.scopes = Object.fromEntries(
      Object.entries(node.scopes).map(([name, scope]) => [name, rewriteScope(scope, keys)]),
    );
  }
  if (node.outputs !== undefined) {
    next.outputs = node.outputs.map((output) => ({
      ...output,
      values: mapValues(output.values, keys),
    }));
  }
  return next;
}

function renamedKeys(
  entries: readonly ClipboardEntry[],
  used: Set<string>,
): ReadonlyMap<string, string> {
  const own = entries.flatMap((entry) => keysIn(entry.node));
  const reserved = new Set([...used, ...own]);
  const keys = new Map<string, string>();
  for (const key of own) {
    if (!used.has(key) || keys.has(key)) continue;
    const fresh = uniqueKey(key, reserved);
    reserved.add(fresh);
    keys.set(key, fresh);
  }
  for (const key of own) used.add(keys.get(key) ?? key);
  return keys;
}

function startPlace(target: PasteTarget): Place {
  if (target.index !== undefined) return { index: target.index };
  return target.after === undefined ? {} : { after: target.after };
}

function nextPlace(place: Place, key: string | undefined): Place {
  if (key !== undefined) return { after: key };
  return place.index === undefined ? place : { index: place.index + 1 };
}

function build(
  entries: readonly ClipboardEntry[],
  used: Set<string>,
  target: PasteTarget,
): PasteResult {
  const keys = renamedKeys(entries, used);
  let place = startPlace(target);
  const body = entries
    .filter((entry) => !entry.trigger)
    .map((entry): PatchOp => {
      const node = rewriteNode(entry.node, keys);
      const placed: PatchOp = { op: 'add', node, in: target.in, ...place };
      place = nextPlace(place, node.key);
      return placed;
    });
  const triggers = entries
    .filter((entry) => entry.trigger)
    .map((entry): PatchOp => ({
      op: 'add',
      node: rewriteNode(entry.node, keys),
      in: TRIGGERS_TARGET,
    }));
  return { ops: [...body, ...triggers], keys };
}

export function pasteOps(
  payload: ClipboardPayload,
  program: Program,
  target: PasteTarget,
): PasteResult {
  return build(payload.entries, new Set(usedKeys(program)), target);
}

export function duplicateOps(program: Program, ids: readonly string[]): readonly PatchOp[] {
  const used = new Set(usedKeys(program));
  return topLevel(program, ids).flatMap((entry) => {
    const target: PasteTarget =
      entry.kind === 'trigger'
        ? { in: TRIGGERS_TARGET }
        : { in: formatScopePath(entry.scope), after: entry.node.key };
    return build([inputOf(entry)], used, target).ops;
  });
}

export function removeOps(program: Program, ids: readonly string[]): readonly PatchOp[] {
  return topLevel(program, ids).map((entry): PatchOp => ({
    op: 'remove',
    key: entry.node.key,
    cascade: true,
  }));
}
