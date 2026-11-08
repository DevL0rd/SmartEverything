import { isExecNode, type FlowNode, type NodeKindLookup } from '@smarteverything/domain';
import { entryReferences, programLevelReferences } from '../check/references';
import { indexProgram, type NodeEntry } from '../program/lookup';
import type { Program } from '../program/walk';

export type ValueAnchors = ReadonlyMap<string, readonly FlowNode[]>;

const START = '';

function firstConsumers(tree: Program, entries: readonly NodeEntry[]): ReadonlyMap<string, string> {
  const consumer = new Map<string, string>();
  for (const reference of programLevelReferences(tree)) {
    if (reference.site.kind === 'admit' && !consumer.has(reference.from)) {
      consumer.set(reference.from, START);
    }
  }
  for (const entry of entries) {
    for (const reference of entryReferences(entry)) {
      if (!consumer.has(reference.from)) consumer.set(reference.from, entry.node.key);
    }
  }
  return consumer;
}

function nextExecOf(
  entries: readonly NodeEntry[],
  at: number,
  kinds: NodeKindLookup,
): FlowNode | undefined {
  const after = entries.slice(at + 1).find((entry) => isExecNode(entry.node.kind, kinds));
  const before = entries
    .slice(0, at)
    .filter((entry) => isExecNode(entry.node.kind, kinds))
    .pop();
  return (after ?? before)?.node;
}

interface Resolver {
  readonly byKey: ReadonlyMap<string, FlowNode>;
  readonly consumer: ReadonlyMap<string, string>;
  readonly startId: string | undefined;
  readonly kinds: NodeKindLookup;
}

function anchorOf(resolver: Resolver, key: string, seen: ReadonlySet<string>): string | undefined {
  const target = resolver.consumer.get(key);
  if (target === undefined || seen.has(target)) return undefined;
  if (target === START) return resolver.startId;
  const node = resolver.byKey.get(target);
  if (node === undefined) return undefined;
  if (isExecNode(node.kind, resolver.kinds)) return node.id;
  return anchorOf(resolver, target, new Set([...seen, key]));
}

export function valueAnchors(
  tree: Program,
  startId: string | undefined,
  kinds: NodeKindLookup,
): ValueAnchors {
  const entries = indexProgram(tree).nodes;
  const resolver: Resolver = {
    byKey: new Map(entries.map((entry) => [entry.node.key, entry.node])),
    consumer: firstConsumers(tree, entries),
    startId,
    kinds,
  };
  const anchors = new Map<string, FlowNode[]>();
  entries.forEach((entry, at) => {
    const { node } = entry;
    if (isExecNode(node.kind, kinds)) return;
    const anchor =
      anchorOf(resolver, node.key, new Set()) ?? nextExecOf(entries, at, kinds)?.id ?? startId;
    if (anchor === undefined) return;
    const held = anchors.get(anchor) ?? [];
    held.push(node);
    anchors.set(anchor, held);
  });
  return anchors;
}
