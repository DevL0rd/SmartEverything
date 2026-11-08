import { describe, expect, it } from 'vitest';
import {
  createVisibilityRegistry,
  type VisibilityRegistry,
} from '../../../components/house-map/live-visibility/registry';
import { LiveViewSet, liveStageId } from './visible-set';

const SHOWN = { onScreen: true, screenFocused: true } as const;

interface Joined {
  readonly registry: VisibilityRegistry;
  readonly set: LiveViewSet;
  readonly ids: string[];
  readonly leaves: (() => void)[];
}

function joined(count: number, functioning = true): Joined {
  const registry = createVisibilityRegistry();
  const set = new LiveViewSet(registry);
  const ids = Array.from({ length: count }, (_, index) => `widget-${String(index)}`);
  const leaves = ids.map((id) => set.join(id, functioning));
  return { registry, set, ids, leaves };
}

describe('live view set', () => {
  it.each([1, 8, 40])(
    'keeps all %i visible functioning widgets live with no count cap',
    (count) => {
      const { set, ids } = joined(count);
      for (const id of ids) set.report(id, SHOWN);
      expect(set.liveIds()).toEqual(ids);
    },
  );

  it('gates on the visibility registry: off screen, unfocused, covered and background', () => {
    const { registry, set, ids } = joined(4);
    for (const id of ids) set.report(id, SHOWN);
    set.report('widget-0', { onScreen: false });
    set.report('widget-1', { screenFocused: false });
    set.report('widget-2', { modalCovered: true });
    expect(set.liveIds()).toEqual(['widget-3']);
    registry.setAppForeground(false);
    expect(set.liveIds()).toEqual([]);
    registry.setAppForeground(true);
    expect(set.liveIds()).toEqual(['widget-3']);
  });

  it('registers each view in the one registry under its live stage id', () => {
    const { registry, set } = joined(1);
    set.report('widget-0', SHOWN);
    expect(registry.getStage(liveStageId('widget-0')).live).toBe(true);
  });

  it('keeps visible idle widgets out of the live set until they function', () => {
    const { set } = joined(2, false);
    set.report('widget-0', SHOWN);
    set.report('widget-1', SHOWN);
    expect(set.liveIds()).toEqual([]);
    set.setFunctioning('widget-1', true);
    expect(set.liveIds()).toEqual(['widget-1']);
  });

  it('notifies only when the live set changes and drops views that leave', () => {
    const { set, leaves } = joined(2);
    let changes = 0;
    set.subscribe(() => {
      changes += 1;
    });
    set.report('widget-0', SHOWN);
    set.report('widget-0', SHOWN);
    expect(changes).toBe(1);
    leaves[0]?.();
    expect(set.liveIds()).toEqual([]);
    expect(changes).toBe(2);
    expect(set.joinedCount()).toBe(1);
  });
});
