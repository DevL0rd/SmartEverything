import type { NodeKindLookup } from '@smarteverything/domain';
import {
  execPortsOf,
  type GraphNode,
  type NodePolicy,
  type PortValue,
  type ProgramV4,
  type StructuredOutput,
  type TriggerNode,
} from '@smarteverything/domain';
import type { HeaderOp, NodeInput, PatchOp, SetOp } from '@smarteverything/flow/graph/ops/schema';
import { joinOfFork } from '@smarteverything/flow/graph/ops/wires';
import { deepEqual, diff } from './deep-equal';
import { rowChangeOps } from './rebase-rows';

type Holder = GraphNode | TriggerNode;

const FORK_KIND = 'flow.parallel';

function holdersOf(program: ProgramV4): readonly Holder[] {
  return [...(program.kind === 'automation' ? program.triggers : []), ...program.nodes];
}

function byId(program: ProgramV4): ReadonlyMap<string, Holder> {
  return new Map(holdersOf(program).map((holder) => [holder.id, holder]));
}

function automationHeader(base: ProgramV4, draft: ProgramV4): Omit<HeaderOp, 'op'> {
  if (base.kind !== 'automation' || draft.kind !== 'automation') return {};
  const policy = deepEqual(base.policy, draft.policy) ? undefined : draft.policy;
  return {
    ...(policy === undefined ? {} : { policy }),
    admit: diff(base.admit, draft.admit),
    budgets: diff(base.budgets, draft.budgets),
  };
}

function headerOps(base: ProgramV4, draft: ProgramV4): PatchOp[] {
  const fields: Omit<HeaderOp, 'op'> = {
    ...(deepEqual(base.variables, draft.variables) ? {} : { variables: draft.variables }),
    ...(deepEqual(base.inputs, draft.inputs) ? {} : { inputs: draft.inputs }),
    ...(deepEqual(base.outputs, draft.outputs) ? {} : { outputs: draft.outputs }),
    description: diff(base.description, draft.description),
    ...automationHeader(base, draft),
  };
  const named = Object.values(fields).filter((value) => value !== undefined);
  return named.length === 0 ? [] : [{ op: 'header', ...fields }];
}

function renameOps(before: ReadonlyMap<string, Holder>, after: readonly Holder[]): PatchOp[] {
  return after.flatMap((holder): PatchOp[] => {
    const was = before.get(holder.id);
    return was !== undefined && was.key !== holder.key
      ? [{ op: 'rename', key: was.key, to: holder.key }]
      : [];
  });
}

function policyOf(holder: Holder): NodePolicy | undefined {
  return 'policy' in holder ? holder.policy : undefined;
}

function outputsOf(holder: Holder): StructuredOutput[] | undefined {
  return 'outputs' in holder ? holder.outputs : undefined;
}

function changedPorts(was: Holder, now: Holder): Record<string, PortValue> | undefined {
  const before = was.ports ?? {};
  const changed = Object.entries(now.ports ?? {}).filter(
    ([name, value]) => !deepEqual(before[name], value),
  );
  return changed.length === 0 ? undefined : Object.fromEntries(changed);
}

function setOf(was: Holder, now: Holder): SetOp | null {
  const fields: Omit<SetOp, 'op' | 'key'> = {
    ports: changedPorts(was, now),
    policy: diff(policyOf(was), policyOf(now)),
    outputs: diff(outputsOf(was), outputsOf(now)),
    label: diff(was.label, now.label),
    note: diff(was.note, now.note),
    enabled: diff(was.enabled, now.enabled),
  };
  return Object.values(fields).every((value) => value === undefined)
    ? null
    : { op: 'set', key: now.key, ...fields };
}

function unsetOf(was: Holder, now: Holder): PatchOp[] {
  const gone = Object.keys(was.ports ?? {}).filter((name) => !(name in (now.ports ?? {})));
  return gone.length === 0 ? [] : [{ op: 'unset', key: now.key, ports: gone }];
}

function fieldOps(before: ReadonlyMap<string, Holder>, after: readonly Holder[]): PatchOp[] {
  return after.flatMap((holder): PatchOp[] => {
    const was = before.get(holder.id);
    if (was === undefined) return [];
    const set = setOf(was, holder);
    return [...(set === null ? [] : [set]), ...unsetOf(was, holder)];
  });
}

function rowOps(before: ReadonlyMap<string, Holder>, after: readonly Holder[]): PatchOp[] {
  return after.flatMap((holder): PatchOp[] => {
    const was = before.get(holder.id);
    if (was === undefined || !isGraphNode(was) || !isGraphNode(holder)) return [];
    return rowChangeOps(was, holder);
  });
}

function isGraphNode(holder: Holder): holder is GraphNode {
  return !holder.kind.startsWith('trigger.');
}

function targetsOf(
  holder: Holder | undefined,
  kinds: NodeKindLookup,
): ReadonlyMap<string, string | undefined> {
  if (holder === undefined || !isGraphNode(holder)) return new Map();
  return new Map(
    execPortsOf(holder.kind, holder, kinds).outputs.map((out) => [out.port, out.target]),
  );
}

function wireOps(
  before: ReadonlyMap<string, Holder>,
  after: readonly Holder[],
  kinds: NodeKindLookup,
): PatchOp[] {
  return after.flatMap((holder): PatchOp[] => {
    const was = targetsOf(before.get(holder.id), kinds);
    return [...targetsOf(holder, kinds)].flatMap(([port, to]): PatchOp[] => {
      if (to === was.get(port)) return [];
      return to === undefined
        ? [{ op: 'disconnect', from: holder.key, port }]
        : [{ op: 'connect', from: holder.key, port, to }];
    });
  });
}

function bare(holder: Holder): NodeInput {
  if (!isGraphNode(holder)) return holder;
  const { to: _to, branches, cases, catches, paths, ...rest } = holder;
  return {
    ...rest,
    ...(branches === undefined ? {} : { branches: branches.map(({ id, when }) => ({ id, when })) }),
    ...(cases === undefined ? {} : { cases: cases.map(({ id, match }) => ({ id, match })) }),
    ...(catches === undefined
      ? {}
      : {
          catches: catches.map(({ id, classes }) => ({
            id,
            ...(classes === undefined ? {} : { classes }),
          })),
        }),
    ...(paths === undefined ? {} : { paths: paths.map(({ name }) => ({ name })) }),
  };
}

function pairedJoins(
  draft: ProgramV4,
  added: readonly Holder[],
  kinds: NodeKindLookup,
): ReadonlyMap<string, string> {
  return new Map(
    added.flatMap((holder): (readonly [string, string])[] => {
      if (holder.kind !== FORK_KIND) return [];
      const join = joinOfFork(draft, holder.key, kinds);
      return join === undefined ? [] : [[holder.id, join]];
    }),
  );
}

function addOps(
  draft: ProgramV4,
  before: ReadonlyMap<string, Holder>,
  kinds: NodeKindLookup,
): PatchOp[] {
  const added = holdersOf(draft).filter((holder) => !before.has(holder.id));
  const joins = pairedJoins(draft, added, kinds);
  const joinKeys = new Set(joins.values());
  const joinNodes = new Map(draft.nodes.map((node) => [node.key, node]));
  return added
    .filter((holder) => !joinKeys.has(holder.key))
    .map((holder): PatchOp => {
      const join = joinNodes.get(joins.get(holder.id) ?? '');
      return {
        op: 'add',
        node: bare(holder),
        ...(join === undefined ? {} : { join: { id: join.id, key: join.key } }),
      };
    });
}

function addedWireOps(
  draft: ProgramV4,
  before: ReadonlyMap<string, Holder>,
  kinds: NodeKindLookup,
): PatchOp[] {
  return wireOps(
    before,
    holdersOf(draft).filter((holder) => !before.has(holder.id)),
    kinds,
  );
}

function removeOps(before: ReadonlyMap<string, Holder>, draft: ProgramV4): PatchOp[] {
  const kept = byId(draft);
  return [...before.values()].flatMap((holder): PatchOp[] =>
    kept.has(holder.id) ? [] : [{ op: 'remove', key: holder.key }],
  );
}

export function draftOps(
  base: ProgramV4,
  draft: ProgramV4,
  kinds: NodeKindLookup,
): readonly PatchOp[] {
  const before = byId(base);
  const after = holdersOf(draft).filter((holder) => before.has(holder.id));
  return [
    ...headerOps(base, draft),
    ...renameOps(before, after),
    ...addOps(draft, before, kinds),
    ...rowOps(before, after),
    ...fieldOps(before, holdersOf(draft)),
    ...wireOps(before, after, kinds),
    ...addedWireOps(draft, before, kinds),
    ...removeOps(before, draft),
  ];
}
