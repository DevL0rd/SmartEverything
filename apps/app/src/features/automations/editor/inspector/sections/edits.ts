import type { NodePolicy, PortValue, StructuredOutput } from '@smarteverything/domain';
import type { PatchOp } from '@smarteverything/flow/ops/schema';
import { keyAvailable, usedKeys } from '@smarteverything/flow/program/keys';
import { formatScopePath } from '@smarteverything/flow/program/paths';
import type { Program } from '@smarteverything/flow/program/walk';
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

export function swapKindOps(view: NodeView, kind: string): readonly PatchOp[] {
  const { entry } = view;
  if (entry.kind !== 'node') return [];
  const { node } = entry;
  return [
    {
      op: 'add',
      in: formatScopePath(entry.scope),
      after: node.key,
      node: {
        kind,
        ...(node.ports === undefined ? {} : { ports: node.ports }),
        ...(node.label === undefined ? {} : { label: node.label }),
        ...(node.note === undefined ? {} : { note: node.note }),
        ...(node.enabled === undefined ? {} : { enabled: node.enabled }),
      },
    },
    { op: 'remove', key: node.key },
  ];
}
