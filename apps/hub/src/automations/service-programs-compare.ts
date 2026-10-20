import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import {
  NODE_REGISTRY,
  nodeLabel,
  programNodes,
  type AutomationProgramChange,
  type AutomationV3,
  type FlowNode,
} from '@smarteverything/domain';

type Fields = Readonly<Record<string, unknown>>;

const HEADER_SKIPPED: ReadonlySet<string> = new Set(['triggers', 'body', 'onFailure']);

const FIELDS = z.record(z.string(), z.unknown());

function plain(value: unknown): Fields {
  return FIELDS.parse(JSON.parse(JSON.stringify(value)));
}

function withoutScope(rows: readonly { readonly scope: unknown }[] | undefined): unknown {
  return rows?.map(({ scope: _scope, ...row }) => row);
}

function fieldsOf(node: FlowNode): Fields {
  return plain({
    ...node,
    scopes: node.scopes === undefined ? undefined : Object.keys(node.scopes),
    branches: withoutScope(node.branches),
    cases: withoutScope(node.cases),
    catches: withoutScope(node.catches),
  });
}

function differing(before: Fields, after: Fields): readonly string[] {
  const names = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...names].filter((name) => !isDeepStrictEqual(before[name], after[name])).sort();
}

function portChanges(before: Fields, after: Fields): readonly string[] {
  const left = plain(before['ports'] ?? {});
  const right = plain(after['ports'] ?? {});
  return differing(left, right);
}

function partsChanged(before: FlowNode, after: FlowNode): readonly string[] {
  const left = fieldsOf(before);
  const right = fieldsOf(after);
  return differing(left, right).flatMap((name) =>
    name === 'ports' ? portChanges(left, right) : [name],
  );
}

function nodesOf(program: AutomationV3): ReadonlyMap<string, FlowNode> {
  return new Map([...program.triggers, ...programNodes(program)].map((node) => [node.id, node]));
}

function change(
  node: FlowNode,
  kind: AutomationProgramChange['change'],
  detail = '',
): AutomationProgramChange {
  const label = nodeLabel(node, (id) => NODE_REGISTRY.get(id));
  const verb = { added: 'Added', removed: 'Removed', changed: 'Changed' }[kind];
  return { id: node.id, key: node.key, change: kind, summary: `${verb} ${label}${detail}` };
}

function nodeChanges(
  before: AutomationV3,
  after: AutomationV3,
): readonly AutomationProgramChange[] {
  const left = nodesOf(before);
  const right = nodesOf(after);
  const removed = [...left.values()].filter((node) => !right.has(node.id));
  const added = [...right.values()].filter((node) => !left.has(node.id));
  const changed = [...right.values()].flatMap((node) => {
    const earlier = left.get(node.id);
    const parts = earlier === undefined ? [] : partsChanged(earlier, node);
    return parts.length === 0 ? [] : [change(node, 'changed', `: ${parts.join(', ')}`)];
  });
  return [
    ...added.map((node) => change(node, 'added')),
    ...removed.map((node) => change(node, 'removed')),
    ...changed,
  ];
}

function headerChanges(
  before: AutomationV3,
  after: AutomationV3,
): readonly AutomationProgramChange[] {
  const keep = (name: string): boolean => !HEADER_SKIPPED.has(name);
  const left = plain(before);
  const right = plain(after);
  return differing(left, right)
    .filter(keep)
    .map((name): AutomationProgramChange => ({
      id: `header.${name}`,
      key: null,
      change: 'changed',
      summary: `Changed the ${name}`,
    }));
}

export function comparePrograms(
  before: AutomationV3,
  after: AutomationV3,
): readonly AutomationProgramChange[] {
  return [...headerChanges(before, after), ...nodeChanges(before, after)];
}
