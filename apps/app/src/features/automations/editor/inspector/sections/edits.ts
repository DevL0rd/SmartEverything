import type { NodeKindLookup } from '@smarteverything/domain';
import type { NodePolicy, PortValue, ProgramV4, StructuredOutput } from '@smarteverything/domain';
import type { PatchOp } from '@smarteverything/flow/graph/ops/schema';
import { keyAvailable, keyBase, usedKeys } from '@smarteverything/flow/program/keys';
import type { Program } from '@smarteverything/flow/program/walk';
import { replaceOps } from '../../../model/editor/replace';
import type { NodeView } from './node-view';

export function labelOps(key: string, text: string): readonly PatchOp[] {
  const label = text.trim();
  return [{ op: 'set', key, label: label === '' ? null : label }];
}

export function noteOps(key: string, text: string): readonly PatchOp[] {
  return [{ op: 'set', key, note: text.trim() === '' ? null : text }];
}

export function enabledOps(key: string, on: boolean): readonly PatchOp[] {
  return [{ op: 'set', key, enabled: on ? null : false }];
}

export function policyOps(key: string, policy: NodePolicy | null): readonly PatchOp[] {
  return [{ op: 'set', key, policy }];
}

export function outputsOps(key: string, outputs: readonly StructuredOutput[]): readonly PatchOp[] {
  return [{ op: 'set', key, outputs: outputs.length === 0 ? null : [...outputs] }];
}

export function portOps(key: string, name: string, value: PortValue | null): readonly PatchOp[] {
  if (value === null) return [{ op: 'unset', key, ports: [name] }];
  return [{ op: 'set', key, ports: { [name]: value } }];
}

export function renameOps(key: string, to: string): readonly PatchOp[] {
  return [{ op: 'rename', key, to }];
}

export function renameProblem(program: Program, from: string, to: string): string | undefined {
  if (to === from) return undefined;
  return keyAvailable(to, usedKeys(program));
}

export function swapKindOps(
  graph: ProgramV4,
  view: NodeView,
  swap: { readonly kind: string; readonly ports?: Readonly<Record<string, PortValue>> },
  kinds: NodeKindLookup,
): readonly PatchOp[] {
  const { kind, ports } = swap;
  const node = graph.nodes.find((item) => item.id === view.id);
  if (node === undefined) return [];
  const replacement = {
    kind,
    base: keyBase(kind.split('.').pop() ?? kind),
    ports: ports ?? node.ports ?? {},
    label: node.label,
    note: node.note,
    enabled: node.enabled,
  };
  return replaceOps(graph, node.key, replacement, { dropOwned: false, kinds }) ?? [];
}
