import type { FlowNode } from '@smarteverything/domain';
import { childScopeRefs } from '../program/walk';

export function compact<T extends Partial<Record<keyof T, unknown>>>(value: T): T {
  for (const key of Object.keys(value)) {
    if (Reflect.get(value, key) === undefined) Reflect.deleteProperty(value, key);
  }
  return value;
}

export function change<T extends Partial<Record<keyof T, unknown>>>(
  target: T,
  changes: Partial<T>,
): void {
  Object.assign(target, changes);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sortedKeys(_key: string, value: unknown): unknown {
  if (!isPlainRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => (left < right ? -1 : 1)),
  );
}

export function canonical(value: unknown): string {
  return JSON.stringify(value, sortedKeys);
}

export function subtreeKeys(node: FlowNode): readonly string[] {
  return childScopeRefs(node, []).flatMap((ref) =>
    ref.scope.nodes.flatMap((child) => [child.key, ...subtreeKeys(child)]),
  );
}
