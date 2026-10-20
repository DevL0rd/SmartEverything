import type { FlowNode } from '@smarteverything/domain';
import type { PatchOp } from '@smarteverything/flow/ops/schema';
import { pinOf } from '@smarteverything/flow/functions/calls';

export type FollowMode = 'follow' | 'pin';

export interface InstanceState {
  readonly mode: FollowMode;
  readonly pinned: number | null;
  readonly latest: number;
  readonly behind: boolean;
  readonly locked: boolean;
  readonly summary: string;
}

export function instanceState(node: FlowNode, latest: number): InstanceState {
  const pinned = pinOf(node) ?? null;
  const behind = pinned !== null && pinned < latest;
  return {
    mode: pinned === null ? 'follow' : 'pin',
    pinned,
    latest,
    behind,
    locked: node.pin !== undefined,
    summary:
      pinned === null
        ? `Follows the latest, version ${String(latest)}`
        : `Pinned to version ${String(pinned)}, latest is ${String(latest)}`,
  };
}

export function pinOps(key: string, revision: number): readonly PatchOp[] {
  return [{ op: 'set', key, ports: { pin: { lit: revision } } }];
}

export function followOps(key: string): readonly PatchOp[] {
  return [{ op: 'unset', key, ports: ['pin'] }];
}

export function revisionChoices(latest: number): readonly { value: string; label: string }[] {
  return Array.from({ length: latest }, (_, index) => {
    const revision = latest - index;
    return {
      value: String(revision),
      label:
        revision === latest
          ? `Version ${String(revision)} (latest)`
          : `Version ${String(revision)}`,
    };
  });
}
