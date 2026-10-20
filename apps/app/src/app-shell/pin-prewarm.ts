import { ValueStore } from '../design/external-store';
import type { PinLeaf } from './pin-leaves';
import { leafIdOf, leafRoutesOf, type LeafRoute } from './pin-routes';
import type { HeldRoute, HostedStack, StackHandle } from './stack-handles';

export const PINNED_WARM_CAP = 12;

export interface PinSource {
  readonly leaves: readonly PinLeaf[];
  readonly recent: readonly string[];
  readonly stacks: readonly HostedStack[];
  readonly cap?: number;
}

export type PinStep =
  | { readonly kind: 'pin'; readonly stack: StackHandle; readonly leaf: PinLeaf }
  | { readonly kind: 'wake'; readonly routeKey: string; readonly label: string }
  | {
      readonly kind: 'drop';
      readonly stack: StackHandle;
      readonly routeKey: string;
      readonly label: string;
    };

const recentLeaves = new ValueStore<readonly string[]>([]);

export const subscribeRecentLeaves = recentLeaves.subscribe;
export const readRecentLeaves = recentLeaves.get;

export function noteLeafOpened(id: string): void {
  recentLeaves.update((current) => [id, ...current.filter((entry) => entry !== id)]);
}

export function warmSetOf(
  leaves: readonly PinLeaf[],
  recent: readonly string[],
  cap: number,
): readonly PinLeaf[] {
  const byId = new Map(leaves.map((leaf) => [leaf.id, leaf]));
  const used = recent.flatMap((id) => {
    const leaf = byId.get(id);
    return leaf === undefined ? [] : [leaf];
  });
  const unique = new Map([...used, ...leaves].map((leaf) => [leaf.id, leaf]));
  return [...unique.values()].slice(0, cap);
}

function leafRouteOf(group: string, name: string): LeafRoute | undefined {
  return leafRoutesOf(group).find((leaf) => leaf.route === name);
}

function holds(stack: StackHandle, leaf: PinLeaf): boolean {
  const same = (held: HeldRoute): boolean =>
    held.name === leaf.route &&
    Object.entries(leaf.params).every(([key, value]) => held.params[key] === value);
  return stack.opened().some(same) || stack.preloaded().some(same);
}

function hostOf(source: PinSource, leaf: PinLeaf): StackHandle | null {
  const hosted = source.stacks.find(
    (entry) => entry.group === leaf.group && entry.handle.declares(leaf.route),
  );
  return hosted?.handle ?? null;
}

function evictable(source: PinSource, wanted: ReadonlySet<string>): PinStep | null {
  for (const { group, handle } of source.stacks) {
    for (const held of handle.preloaded()) {
      const route = leafRouteOf(group, held.name);
      if (route !== undefined && !wanted.has(leafIdOf(route, held.params))) {
        return { kind: 'drop', stack: handle, routeKey: held.key, label: held.name };
      }
    }
  }
  return null;
}

function coldPreloaded(source: PinSource, isAwake: (key: string) => boolean): PinStep | null {
  for (const { handle } of source.stacks) {
    const cold = handle.preloaded().find((held) => !isAwake(held.key));
    if (cold !== undefined) return { kind: 'wake', routeKey: cold.key, label: cold.name };
  }
  return null;
}

export function nextPinStep(
  hosts: ReadonlySet<string>,
  isAwake: (key: string) => boolean,
  source: PinSource,
): PinStep | null {
  const warm = warmSetOf(source.leaves, source.recent, source.cap ?? PINNED_WARM_CAP);
  const evict = evictable(source, new Set(warm.map((leaf) => leaf.id)));
  if (evict !== null) return evict;
  const cold = coldPreloaded(source, isAwake);
  if (cold !== null) return cold;
  for (const leaf of warm) {
    const stack = hosts.has(leaf.group) ? hostOf(source, leaf) : null;
    if (stack !== null && !holds(stack, leaf)) return { kind: 'pin', stack, leaf };
  }
  return null;
}
