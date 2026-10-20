import type { FlowNode, TriggerNode } from '@smarteverything/domain';
import { wireScopeOf, type DescribeContext } from '@smarteverything/domain';
import type { NodeEntry } from '@smarteverything/flow/program/lookup';
import { indexProgram } from '@smarteverything/flow/program/lookup';
import { formatScopePath } from '@smarteverything/flow/program/paths';
import type { Program, ScopeRef } from '@smarteverything/flow/program/walk';
import { rootScopes } from '@smarteverything/flow/program/walk';
import type { SceneEdge } from './contract';
import type { Draft, Env, Item, KindView, Lane, ProjectOptions } from './tree-env';
import {
  groupProblems,
  isAutomation,
  isValueClass,
  kindView,
  titleOf,
  valueWords,
} from './tree-env';
import type { Placement } from './tree-draft';
import {
  admitDraft,
  exitsDraft,
  groupDraft,
  inputsDraft,
  laneDraft,
  slotDraft,
  stepDraft,
  triggerDraft,
} from './tree-draft';
import { laneSpecs } from './tree-lanes';
import { requestsOf } from './tree-requests';
import { referencesOf } from './references';
import { wireOne } from './tree-ports';

export interface Tree {
  readonly triggers: readonly Item[];
  readonly group: Draft | null;
  readonly admit: Draft | null;
  readonly inputs: Draft | null;
  readonly exits: Draft | null;
  readonly body: Lane;
  readonly failure: Lane | null;
  readonly edges: readonly SceneEdge[];
  readonly total: number;
}

type Where = Pick<Placement, 'depth' | 'path'>;

const ROOT: Where = { depth: 0, path: [] };

function makeEnv(program: Program, options: ProjectOptions): Env {
  const index = indexProgram(program);
  const kinds = (id: string): KindView => kindView(options.registry, id);
  const execs = index.nodes.filter((entry) => !isValueClass(kinds(entry.node.kind).cls));
  const values = new Map<string, FlowNode>(
    index.nodes
      .filter((entry) => isValueClass(kinds(entry.node.kind).cls))
      .map((entry) => [entry.node.key, entry.node]),
  );
  const titles = new Map<string, string>(
    [...index.byKey].map(([key, entry]) => [key, titleOf(options, entry.node)]),
  );
  const inputsId = program.kind === 'function' ? 'inputs' : null;
  const keys = new Set([...index.byKey.keys(), ...(inputsId === null ? [] : ['inputs'])]);
  const describe: DescribeContext = {
    kinds: (id) => options.registry.get(id),
    names: options.names ?? ((): undefined => undefined),
  };
  return {
    options,
    describe,
    scope: wireScopeOf(program, describe),
    kinds,
    program,
    index,
    problems: groupProblems(options.problems ?? []),
    values,
    claimed: new Set(),
    ordinals: new Map(execs.map((entry, order) => [entry.node.id, order + 1])),
    total: execs.length,
    inputsId,
    keys,
    referenced: referencedKeys(visibleNodes(index.nodes, options, kinds), keys),
    titles,
    edges: [],
    edgeIds: new Set(),
  };
}

function isContainerNode(kind: KindView, node: FlowNode): boolean {
  return kind.scopes !== undefined || node.branches !== undefined;
}

function visibleNodes(
  nodes: readonly NodeEntry[],
  options: ProjectOptions,
  kinds: (id: string) => KindView,
): readonly NodeEntry[] {
  const collapsed = new Set(
    nodes
      .filter((entry) => isContainerNode(kinds(entry.node.kind), entry.node))
      .filter((entry) => options.layout.nodes[entry.node.id]?.collapsed === true)
      .map((entry) => entry.node.key),
  );
  return nodes.filter(
    (entry) =>
      (entry.storage[0] !== 'onFailure' || options.failureOpen === true) &&
      !entry.ancestors.some((ancestor) => collapsed.has(ancestor)),
  );
}

function referencedKeys(
  nodes: readonly NodeEntry[],
  known: ReadonlySet<string>,
): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const entry of nodes) {
    for (const request of requestsOf(entry.node)) {
      for (const reference of referencesOf(request.value, known)) keys.add(reference.key);
    }
  }
  return keys;
}

function descendantCount(env: Env, node: FlowNode): number {
  const key = node.key;
  return env.index.nodes.filter((entry) => entry.ancestors.includes(key)).length;
}

function buildValue(env: Env, node: FlowNode, at: number, place: Placement): Item {
  const kind = env.kinds(node.kind);
  const values = attach(env, node, place, titleOf(env.options, node));
  return {
    draft: stepDraft(env, { node, kind, role: 'value' }, place),
    at,
    exec: false,
    values,
    lanes: [],
  };
}

function attach(env: Env, node: FlowNode, where: Where, consumer: string): readonly Item[] {
  const items: Item[] = [];
  for (const request of requestsOf(node)) {
    for (const key of wireOne(env, request)) {
      const valueNode = env.values.get(key);
      if (valueNode === undefined) continue;
      const at = env.index.byId.get(valueNode.id);
      const place: Placement = {
        depth: where.depth,
        path: where.path,
        feeds: request.port,
        consumer,
        unused: false,
        collapsed: false,
        hiddenCount: 0,
        lanes: [],
      };
      items.push(buildValue(env, valueNode, at?.kind === 'node' ? at.index : 0, place));
    }
  }
  return items;
}

function buildLanes(env: Env, entry: NodeEntry, where: Where, title: string): readonly Lane[] {
  const kind = env.kinds(entry.node.kind);
  return laneSpecs(entry.node, kind, entry.storage, (value) => valueWords(env, value)).map(
    (spec) => {
      const inner: Where = { depth: where.depth + 1, path: [...where.path, title, spec.title] };
      const items = buildItems(env, spec.ref, inner);
      return {
        id: spec.id,
        draft: laneDraft(spec.id, 'lane', {
          title: spec.title,
          chip: spec.chip,
          pills: spec.pills,
          pins: spec.pins,
          collapsed: false,
          hiddenCount: 0,
          depth: inner.depth,
        }),
        path: spec.ref.path,
        length: spec.ref.scope.nodes.length,
        items,
        slot: items.some((item) => item.exec) ? null : slotDraft(spec.id, inner.depth),
        loopLabel: spec.loopLabel,
      };
    },
  );
}

function buildExec(env: Env, entry: NodeEntry, where: Where): Item {
  const node = entry.node;
  const kind = env.kinds(node.kind);
  const title = titleOf(env.options, node);
  const container = isContainerNode(kind, node);
  const collapsed = container && env.options.layout.nodes[node.id]?.collapsed === true;
  const values = attach(env, node, where, title);
  const lanes = container && !collapsed ? buildLanes(env, entry, where, title) : [];
  const place: Placement = {
    depth: where.depth,
    path: where.path,
    feeds: null,
    consumer: null,
    unused: false,
    collapsed,
    hiddenCount: collapsed ? descendantCount(env, node) : 0,
    lanes: laneSpecs(node, kind, entry.storage, (value) => valueWords(env, value)).map(
      (spec) => spec.title,
    ),
  };
  return {
    draft: stepDraft(env, { node, kind, role: container ? 'container' : 'step' }, place),
    at: entry.index,
    exec: true,
    values,
    lanes,
  };
}

function buildItems(env: Env, ref: ScopeRef, where: Where): readonly Item[] {
  const items: Item[] = [];
  ref.scope.nodes.forEach((node, at) => {
    const entry = env.index.byId.get(node.id);
    if (entry?.kind !== 'node') return;
    const kind = env.kinds(node.kind);
    if (!isValueClass(kind.cls)) {
      items.push(buildExec(env, entry, where));
    } else if (!env.referenced.has(node.key)) {
      env.claimed.add(node.key);
      items.push(orphan(env, node, at, where));
    }
  });
  return items;
}

function orphan(env: Env, node: FlowNode, at: number, where: Where): Item {
  const place: Placement = {
    depth: where.depth,
    path: where.path,
    feeds: null,
    consumer: null,
    unused: true,
    collapsed: false,
    hiddenCount: 0,
    lanes: [],
  };
  return buildValue(env, node, at, place);
}

function rootLane(env: Env, ref: ScopeRef, id: string, failure: boolean): Lane {
  const open = !failure || env.options.failureOpen === true;
  const where: Where = ROOT;
  const items = open ? buildItems(env, ref, where) : [];
  const draft = failure
    ? laneDraft(id, 'failure', {
        title: 'If the run fails',
        chip: null,
        pills: [],
        pins: [],
        collapsed: !open,
        hiddenCount: ref.scope.nodes.length,
        depth: 0,
      })
    : null;
  return {
    id,
    draft,
    path: ref.path,
    length: ref.scope.nodes.length,
    items,
    slot: open && !items.some((item) => item.exec) ? slotDraft(id, 0) : null,
    loopLabel: null,
  };
}

function triggerItems(env: Env): readonly Item[] {
  if (!isAutomation(env.program)) return [];
  const nodes: readonly TriggerNode[] = env.program.triggers;
  return nodes.map((node, index) => ({
    draft: triggerDraft(env, node, index, nodes.length),
    at: index,
    exec: true,
    values: [],
    lanes: [],
  }));
}

export function buildTree(program: Program, options: ProjectOptions): Tree {
  const env = makeEnv(program, options);
  const roots = rootScopes(program);
  const bodyRef = roots[0];
  if (bodyRef === undefined) throw new Error('a program always has a body');
  const failureRef = roots.find((root) => formatScopePath(root.path) === 'onFailure');
  const triggers = triggerItems(env);
  const body = rootLane(env, bodyRef, 'body', false);
  const failure = failureRef === undefined ? null : rootLane(env, failureRef, 'onFailure', true);
  const automation = isAutomation(program) ? program : null;
  return {
    triggers,
    group: triggers.length > 1 ? groupDraft(triggers.length) : null,
    admit:
      automation?.admit === undefined ? null : admitDraft(env, valueWords(env, automation.admit)),
    inputs: program.kind === 'function' ? inputsDraft(program.inputs) : null,
    exits: program.kind === 'function' ? exitsDraft(program.exits) : null,
    body,
    failure,
    edges: env.edges,
    total: env.total,
  };
}
