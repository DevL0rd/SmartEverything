import { describe, expect, it } from 'vitest';
import { pinLeafOf } from './pin-leaves';
import { nextPinStep, warmSetOf, type PinSource } from './pin-prewarm';
import type { HeldRoute, HostedStack, StackHandle } from './stack-handles';

function handle(
  key: string,
  held: { opened?: readonly HeldRoute[]; preloaded?: readonly HeldRoute[] } = {},
  declares = true,
): StackHandle {
  return {
    key,
    routeNames: () => [],
    declares: () => declares,
    opened: () => held.opened ?? [],
    preloaded: () => held.preloaded ?? [],
    preload: () => undefined,
    drop: () => undefined,
  };
}

function room(index: number): NonNullable<ReturnType<typeof pinLeafOf>> {
  const leaf = pinLeafOf({
    kind: 'room',
    roomId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  });
  if (leaf === null) throw new Error('A room pin must have a leaf.');
  return leaf;
}

function heldOf(leaf: ReturnType<typeof room>, key: string): HeldRoute {
  return { key, name: leaf.route, params: leaf.params };
}

const everyAwake = (): boolean => true;
const homeHosts = new Set(['(home)']);

describe('the pinned warm set', () => {
  it('lists the recently opened pins first, then the layout order, up to the cap', () => {
    const leaves = [room(1), room(2), room(3), room(4)];
    const recent = [room(4).id, 'gone', room(2).id];
    expect(warmSetOf(leaves, recent, 3).map((leaf) => leaf.id)).toEqual([
      room(4).id,
      room(2).id,
      room(1).id,
    ]);
  });
});

describe('the next pinned step', () => {
  const source = (stack: StackHandle, leaves: readonly ReturnType<typeof room>[]): PinSource => ({
    leaves,
    recent: [],
    stacks: [{ group: '(home)', handle: stack } satisfies HostedStack],
  });

  it('preloads the first pin in layout order that the stack does not hold', () => {
    const held = handle('s', { preloaded: [heldOf(room(1), 'k1')] });
    const step = nextPinStep(homeHosts, everyAwake, source(held, [room(1), room(2), room(3)]));
    expect(step).toMatchObject({ kind: 'pin', leaf: { id: room(2).id } });
  });

  it('wakes a preloaded page before it preloads the next one', () => {
    const held = handle('s', { preloaded: [heldOf(room(1), 'k1')] });
    const step = nextPinStep(homeHosts, () => false, source(held, [room(1), room(2)]));
    expect(step).toEqual({ kind: 'wake', routeKey: 'k1', label: room(1).route });
  });

  it('drops a preloaded page whose pin is gone or fell out of the cap', () => {
    const held = handle('s', { preloaded: [heldOf(room(1), 'k1'), heldOf(room(9), 'k9')] });
    const step = nextPinStep(homeHosts, everyAwake, source(held, [room(1)]));
    expect(step).toMatchObject({ kind: 'drop', routeKey: 'k9' });
  });

  it('counts a page that is open as held', () => {
    const held = handle('s', { opened: [heldOf(room(1), 'k1')] });
    expect(nextPinStep(homeHosts, everyAwake, source(held, [room(1)]))).toBeNull();
  });

  it('waits for the host tab to be awake and for its stack to declare the route', () => {
    const stack = handle('s');
    expect(nextPinStep(new Set(), everyAwake, source(stack, [room(1)]))).toBeNull();
    expect(
      nextPinStep(homeHosts, everyAwake, source(handle('s', {}, false), [room(1)])),
    ).toBeNull();
    expect(
      nextPinStep(homeHosts, everyAwake, { leaves: [room(1)], recent: [], stacks: [] }),
    ).toBeNull();
  });
});
