import type { FlowNode, TriggerNode, Wire } from '@smarteverything/domain';
import { FLOW_SCOPE_OUTPUTS, isReservedRoot } from '@smarteverything/domain';
import type { Entry, NodeEntry, ProgramIndex } from '../program/lookup';
import type { ChildPart, ScopePath } from '../program/paths';
import { BODY_PATH, childPath, formatChildPart, formatScopePath } from '../program/paths';
import { childScopeRefs } from '../program/walk';
import type { PortReference, ReferenceSite } from './references';
import { entryReferences, programLevelReferences } from './references';
import type {
  ReferenceOwner,
  ResolvedReference,
  VisibilityKinds,
  VisibilityProblem,
  VisibilityReason,
  VisibilityReport,
  VisibilityVia,
} from './visibility-types';

interface Success {
  readonly ok: true;
  readonly via: VisibilityVia;
  readonly optional: boolean;
}

interface Failure {
  readonly ok: false;
  readonly reason: VisibilityReason;
  readonly message: string;
}

type Resolution = Success | Failure;

interface Level {
  readonly scope: string;
  readonly index: number;
}

interface Enclosing {
  readonly entry: NodeEntry;
  readonly part: ChildPart;
}

interface Position {
  readonly levels: readonly Level[];
  readonly enclosing: readonly Enclosing[];
  readonly selfKey: string | undefined;
  readonly leading?: number | undefined;
}

interface Context {
  readonly index: ProgramIndex;
  readonly kinds: VisibilityKinds;
  readonly cache: Map<object, readonly PortReference[]>;
  readonly multiTrigger: boolean;
}

const EMPTY: Position = { levels: [], enclosing: [], selfKey: undefined };

const WATCHED_TRIGGER_PORT = 'condition';

export function defaultScopeOutputs(kind: string, part: ChildPart): readonly string[] {
  const declared = (FLOW_SCOPE_OUTPUTS[kind] ?? []).map((output) => output.name);
  if (kind === 'flow.try') return part.kind === 'catch' ? declared : [];
  return part.kind === 'scope' && part.name === 'body' ? declared : [];
}

const ok = (via: VisibilityVia, optional = false): Success => ({ ok: true, via, optional });

const fail = (reason: VisibilityReason, message: string): Failure => ({
  ok: false,
  reason,
  message,
});

function referencesOf(
  ctx: Context,
  owner: FlowNode | TriggerNode,
  entry: Entry,
): readonly PortReference[] {
  const cached = ctx.cache.get(owner);
  if (cached !== undefined) return cached;
  const found = entryReferences(entry);
  ctx.cache.set(owner, found);
  return found;
}

function scopeOutputsOf(ctx: Context, kind: string, part: ChildPart): readonly string[] {
  return (ctx.kinds.scopeOutputsOf ?? defaultScopeOutputs)(kind, part);
}

function childParts(node: FlowNode): readonly ChildPart[] {
  return [
    ...Object.keys(node.scopes ?? {}).map((name): ChildPart => ({ kind: 'scope', name })),
    ...(node.branches ?? []).map((row): ChildPart => ({ kind: 'branch', id: row.id })),
    ...(node.cases ?? []).map((row): ChildPart => ({ kind: 'case', id: row.id })),
    ...(node.catches ?? []).map((row): ChildPart => ({ kind: 'catch', id: row.id })),
  ];
}

function nodeEntry(ctx: Context, key: string): NodeEntry | undefined {
  const found = ctx.index.byKey.get(key);
  return found?.kind === 'node' ? found : undefined;
}

function enclosingChain(ctx: Context, scope: ScopePath): readonly Enclosing[] {
  const chain: Enclosing[] = [];
  let current = scope;
  while (current.t === 'child') {
    const ancestor = nodeEntry(ctx, current.key);
    if (ancestor === undefined) break;
    chain.push({ entry: ancestor, part: current.part });
    current = ancestor.scope;
  }
  return chain;
}

function basePosition(ctx: Context, entry: NodeEntry): Position {
  const enclosing = enclosingChain(ctx, entry.scope);
  return {
    levels: [
      { scope: formatScopePath(entry.scope), index: entry.index },
      ...enclosing.map((outer) => ({
        scope: formatScopePath(outer.entry.scope),
        index: outer.entry.index,
      })),
    ],
    enclosing,
    selfKey: entry.node.key,
  };
}

function matchesScopeKey(part: ChildPart, key: string): boolean {
  return formatChildPart(part) === key || (part.kind !== 'scope' && part.id === key);
}

function sitePosition(entry: NodeEntry, base: Position, site: ReferenceSite): Position {
  if (site.kind !== 'output') return base;
  const part = childParts(entry.node).find((candidate) => matchesScopeKey(candidate, site.scope));
  if (part === undefined) return base;
  return {
    levels: [
      { scope: formatScopePath(childPath(entry.node.key, part)), index: Infinity },
      ...base.levels,
    ],
    enclosing: [{ entry, part }, ...base.enclosing],
    selfKey: base.selfKey,
  };
}

function isValueClass(ctx: Context, kind: string): boolean {
  const kindClass = ctx.kinds.classOf(kind);
  return kindClass === 'pure' || kindClass === 'read';
}

function admitPosition(ctx: Context): Position {
  const { nodes } = ctx.index.program.body;
  const end = nodes.findIndex((node) => !isValueClass(ctx, node.kind));
  return { ...EMPTY, leading: end < 0 ? nodes.length : end };
}

function watchesReads(entry: Entry | undefined, site: ReferenceSite): boolean {
  if (entry === undefined) return site.kind === 'admit';
  return entry.kind === 'trigger' && site.kind === 'port' && site.port === WATCHED_TRIGGER_PORT;
}

function ownerPosition(ctx: Context, entry: Entry | undefined, site: ReferenceSite): Position {
  if (watchesReads(entry, site)) return admitPosition(ctx);
  if (entry?.kind !== 'node') return EMPTY;
  const base = basePosition(ctx, entry);
  const [first, ...rest] = base.levels;
  const lenient =
    first !== undefined && isValueClass(ctx, entry.node.kind)
      ? { ...base, levels: [{ scope: first.scope, index: Infinity }, ...rest] }
      : base;
  return sitePosition(entry, lenient, site);
}

function outsideFailure(ctx: Context, pos: Position, entry: NodeEntry): Failure {
  const finished = enclosingChain(ctx, entry.scope).some(({ entry: outer }) => {
    const at = pos.levels.find((candidate) => candidate.scope === formatScopePath(outer.scope));
    return at !== undefined && outer.index < at.index;
  });
  return finished
    ? fail(
        'inside_finished_container',
        `${entry.node.key} is inside a container that has finished; only its outputs are visible`,
      )
    : fail('not_in_scope', `${entry.node.key} is not in a scope that this step can see`);
}

function placementFailure(
  ctx: Context,
  pos: Position,
  entry: NodeEntry,
  why: string,
): Failure | undefined {
  const own = formatScopePath(entry.scope);
  const level = pos.levels.find((candidate) => candidate.scope === own);
  if (level === undefined) return outsideFailure(ctx, pos, entry);
  return entry.index < level.index
    ? undefined
    : fail('comes_later', `${entry.node.key} comes later, so ${why} has no value yet`);
}

function covers(node: FlowNode, outputKey: Readonly<Record<string, unknown>>): boolean {
  const parts = childParts(node);
  const has = (name: string): boolean =>
    parts.some((part) => part.kind === 'scope' && part.name === name);
  if (node.kind === 'flow.if' && !has('else')) return false;
  if (node.kind === 'flow.switch' && !has('default')) return false;
  return parts
    .filter((part) => !(part.kind === 'scope' && part.name === 'finally'))
    .every((part) => Object.keys(outputKey).some((key) => matchesScopeKey(part, key)));
}

function resolveEnclosing(ctx: Context, enclosing: Enclosing, port: string): Resolution {
  const names = scopeOutputsOf(ctx, enclosing.entry.node.kind, enclosing.part);
  if (names.includes(port)) return ok('scope_output');
  const key = enclosing.entry.node.key;
  return fail(
    'not_a_scope_output',
    names.length === 0
      ? `${key} gives nothing to its own scopes`
      : `${key} gives ${names.join(', ')} inside it, not ${port}`,
  );
}

function resolveFinished(ctx: Context, pos: Position, entry: NodeEntry, port: string): Resolution {
  const placed = placementFailure(ctx, pos, entry, 'its output');
  if (placed !== undefined) return placed;
  const key = entry.node.key;
  const structured = entry.node.outputs?.find((output) => output.name === port);
  if (structured !== undefined) return ok('structured', !covers(entry.node, structured.values));
  const result = ctx.kinds.outputsOf(entry.node.kind).find((output) => output.name === port);
  if (result !== undefined) return ok('result', result.optional === true);
  return fail(
    'not_an_output',
    `${key} has no declared output named ${port}; nothing inside it is visible after it`,
  );
}

function resolvePure(
  ctx: Context,
  pos: Position,
  entry: NodeEntry,
  trail: ReadonlySet<string>,
): Resolution {
  const key = entry.node.key;
  const own = formatScopePath(entry.scope);
  if (!pos.levels.some((level) => level.scope === own)) return outsideFailure(ctx, pos, entry);
  if (trail.has(key)) return fail('cycle', `${key} depends on itself`);
  const next = new Set(trail).add(key);
  for (const inner of referencesOf(ctx, entry.node, entry)) {
    const resolved = resolveRoot(ctx, pos, inner, next);
    if (!resolved.ok) {
      return fail(
        'pure_not_visible',
        `${key} reads ${inner.from}, which is not visible here: ${resolved.message}`,
      );
    }
  }
  return ok('pure');
}

interface Query {
  readonly pos: Position;
  readonly port: string;
  readonly trail: ReadonlySet<string>;
}

function resolveLeading(ctx: Context, entry: NodeEntry, limit: number): Resolution {
  const key = entry.node.key;
  const inBody = formatScopePath(entry.scope) === formatScopePath(BODY_PATH);
  if (!inBody || entry.index >= limit) {
    return fail('not_in_scope', `${key} is not in a scope that this step can see`);
  }
  const earlier: Position = { ...EMPTY, leading: entry.index };
  for (const inner of referencesOf(ctx, entry.node, entry)) {
    const resolved = resolveRoot(ctx, earlier, inner, new Set());
    if (!resolved.ok) {
      return fail(
        'pure_not_visible',
        `${key} reads ${inner.from}, which admission has not evaluated yet: ${resolved.message}`,
      );
    }
  }
  return ok(ctx.kinds.classOf(entry.node.kind) === 'pure' ? 'pure' : 'before');
}

function resolveNode(ctx: Context, entry: NodeEntry, query: Query): Resolution {
  const { pos, port, trail } = query;
  if (pos.leading !== undefined) return resolveLeading(ctx, entry, pos.leading);
  const key = entry.node.key;
  const enclosing = pos.enclosing.find((candidate) => candidate.entry.node.key === key);
  if (enclosing !== undefined) return resolveEnclosing(ctx, enclosing, port);
  if (pos.selfKey === key) return fail('self', `${key} cannot read its own outputs`);
  if (childScopeRefs(entry.node, entry.storage).length > 0)
    return resolveFinished(ctx, pos, entry, port);
  if (isValueClass(ctx, entry.node.kind)) return resolvePure(ctx, pos, entry, trail);
  return placementFailure(ctx, pos, entry, 'its output') ?? ok('before');
}

function resolveRoot(
  ctx: Context,
  pos: Position,
  reference: Wire,
  trail: ReadonlySet<string>,
): Resolution {
  if (isReservedRoot(reference.from)) return ok('reserved');
  const found = ctx.index.byKey.get(reference.from);
  if (found === undefined)
    return fail('unknown_key', `${reference.from} is not a step or trigger of this program`);
  if (found.kind === 'trigger') return ok('trigger', ctx.multiTrigger);
  return resolveNode(ctx, found, { pos, port: reference.port, trail });
}

function checkOwner(
  ctx: Context,
  subject: { readonly owner: ReferenceOwner; readonly entry: Entry | undefined },
  references: readonly PortReference[],
): VisibilityReport {
  const { owner, entry } = subject;
  const lenient = entry?.kind === 'node' && isValueClass(ctx, entry.node.kind);
  const trail: ReadonlySet<string> = lenient ? new Set([entry.node.key]) : new Set();
  const problems: VisibilityProblem[] = [];
  const resolved: ResolvedReference[] = [];
  for (const reference of references) {
    const pos = ownerPosition(ctx, entry, reference.site);
    const result = resolveRoot(ctx, pos, reference, trail);
    if (result.ok) resolved.push({ owner, reference, via: result.via, optional: result.optional });
    else problems.push({ owner, reference, reason: result.reason, message: result.message });
  }
  return { problems, resolved };
}

function triggerEntries(index: ProgramIndex): readonly Entry[] {
  const { program } = index;
  if (program.kind !== 'automation') return [];
  return program.triggers.map((node, position): Entry => ({
    kind: 'trigger',
    node,
    index: position,
    storage: ['triggers', position],
  }));
}

export function checkVisibility(index: ProgramIndex, kinds: VisibilityKinds): VisibilityReport {
  const { program } = index;
  const ctx: Context = {
    index,
    kinds,
    cache: new Map(),
    multiTrigger: program.kind === 'automation' && program.triggers.length > 1,
  };
  const reports: VisibilityReport[] = [
    checkOwner(
      ctx,
      { owner: { kind: 'program' }, entry: undefined },
      programLevelReferences(program),
    ),
  ];
  for (const entry of triggerEntries(index)) {
    const owner: ReferenceOwner = { kind: 'trigger', id: entry.node.id, key: entry.node.key };
    reports.push(checkOwner(ctx, { owner, entry }, referencesOf(ctx, entry.node, entry)));
  }
  for (const entry of index.nodes) {
    const owner: ReferenceOwner = { kind: 'node', id: entry.node.id, key: entry.node.key };
    reports.push(checkOwner(ctx, { owner, entry }, referencesOf(ctx, entry.node, entry)));
  }
  return {
    problems: reports.flatMap((report) => report.problems),
    resolved: reports.flatMap((report) => report.resolved),
  };
}
