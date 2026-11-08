import type { NodeKindLookup } from '@smarteverything/domain';
import {
  execPortsOf,
  isExecNode,
  type GraphNode,
  type PortValue,
  type ProgramV4,
} from '@smarteverything/domain';
import type { PatchOp } from '@smarteverything/flow/graph/ops/schema';
import { outputsOfNode, wiresInto } from '@smarteverything/flow/graph/ops/wires';
import { uniqueKey } from '@smarteverything/flow/program/keys';
import { indexProgram, siblings } from '@smarteverything/flow/program/lookup';
import { structuredFor } from './structured';

export interface Replacement {
  readonly kind: string;
  readonly base: string;
  readonly ports: Readonly<Record<string, PortValue>>;
  readonly label?: string | undefined;
  readonly note?: string | undefined;
  readonly enabled?: boolean | undefined;
}

export function continuationOf(
  program: ProgramV4,
  node: GraphNode,
  kinds: NodeKindLookup,
): string | undefined {
  const own = outputsOfNode(node, kinds).find((out) => out.role === 'next');
  if (own !== undefined) return own.target;
  const structured = structuredFor(program, kinds);
  if (structured.kind !== 'structured') return undefined;
  const order = siblings(indexProgram(structured.tree), node.key);
  const at = order.findIndex((item) => item.key === node.key);
  return order.slice(at + 1).find((item) => isExecNode(item.kind, kinds))?.key;
}

export function ownedKeys(
  program: ProgramV4,
  key: string,
  kinds: NodeKindLookup,
): readonly string[] {
  const structured = structuredFor(program, kinds);
  if (structured.kind !== 'structured') return [];
  return indexProgram(structured.tree)
    .nodes.filter((entry) => entry.ancestors.includes(key) && isExecNode(entry.node.kind, kinds))
    .map((entry) => entry.node.key);
}

function fieldsOf(replacement: Replacement): {
  readonly label?: string;
  readonly note?: string;
  readonly enabled?: boolean;
} {
  return {
    ...(replacement.label === undefined ? {} : { label: replacement.label }),
    ...(replacement.note === undefined ? {} : { note: replacement.note }),
    ...(replacement.enabled === undefined ? {} : { enabled: replacement.enabled }),
  };
}

export function replaceOps(
  program: ProgramV4,
  key: string,
  replacement: Replacement,
  options: { readonly dropOwned: boolean; readonly kinds: NodeKindLookup },
): readonly PatchOp[] | null {
  const { dropOwned, kinds } = options;
  const node = program.nodes.find((candidate) => candidate.key === key);
  if (node === undefined) return null;
  const fresh = uniqueKey(replacement.base, new Set(program.nodes.map((item) => item.key)));
  const next = continuationOf(program, node, kinds);
  const carry = execPortsOf(replacement.kind, undefined, kinds).outputs.find(
    (out) => out.role === 'next',
  );
  return [
    {
      op: 'add',
      node: {
        kind: replacement.kind,
        key: fresh,
        ports: { ...replacement.ports },
        ...fieldsOf(replacement),
      },
    },
    ...wiresInto(program, new Set([key]), kinds).map((wire): PatchOp => ({
      op: 'connect',
      from: wire.from,
      port: wire.port,
      to: fresh,
    })),
    ...(next === undefined || carry === undefined
      ? []
      : [{ op: 'connect', from: fresh, port: carry.port, to: next } as const]),
    ...(dropOwned ? ownedKeys(program, key, kinds) : []).map((owned): PatchOp => ({
      op: 'remove',
      key: owned,
    })),
    { op: 'remove', key },
  ];
}
