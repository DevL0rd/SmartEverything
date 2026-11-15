import { describe, expect, it } from 'vitest';
import type { FrameScheduler } from './frame-loop';
import {
  watchLayout,
  type LayoutTarget,
  type LayoutWatchHost,
  type NodeWatch,
} from './layout-watch';
import type { LiveRect } from './renderer-core';

interface FakeWatch {
  readonly observed: Set<string>;
  readonly fire: () => void;
}

interface Fake {
  readonly host: LayoutWatchHost<string>;
  readonly targets: LayoutTarget<string>[];
  readonly rects: Map<string, LiveRect>;
  readonly reads: () => number;
  readonly frames: () => number;
  readonly tick: () => void;
  readonly sizes: FakeWatch;
  readonly structure: FakeWatch;
  readonly styles: FakeWatch;
}

const DOCUMENT = 'body';

const PARENTS: Readonly<Record<string, string>> = {
  view: 'card',
  card: 'content',
  content: 'scroll',
  scroll: 'screen',
  screen: DOCUMENT,
};

function fakeWatch(): {
  readonly make: (onChange: () => void) => NodeWatch<string>;
  readonly watch: FakeWatch;
} {
  const observed = new Set<string>();
  let listener = (): undefined => undefined;
  const watch: FakeWatch = {
    observed,
    fire: (): void => {
      if (observed.size > 0) listener();
    },
  };
  return {
    watch,
    make: (onChange): NodeWatch<string> => {
      listener = (): undefined => {
        onChange();
        return undefined;
      };
      return {
        observe: (node): void => {
          observed.add(node);
        },
        disconnect: (): void => {
          observed.clear();
        },
      };
    },
  };
}

function fakeHost(): Fake {
  const targets: LayoutTarget<string>[] = [];
  const rects = new Map<string, LiveRect>();
  let reads = 0;
  const queued = new Map<number, (nowMs: number) => void>();
  let handles = 0;
  const scheduler: FrameScheduler = {
    request: (callback): number => {
      handles += 1;
      queued.set(handles, callback);
      return handles;
    },
    cancel: (handle): void => {
      queued.delete(handle);
    },
    now: (): number => 0,
  };
  const sizes = fakeWatch();
  const structure = fakeWatch();
  const styles = fakeWatch();
  const host: LayoutWatchHost<string> = {
    targets: () => targets,
    rectOf: (node): LiveRect => {
      reads += 1;
      const rect = rects.get(node);
      if (rect === undefined) throw new Error(`no rect for ${node}`);
      return rect;
    },
    scopeOf: (target) => target.clips[0] ?? DOCUMENT,
    chainOf: function* (target): Iterable<string> {
      for (
        let at: string | undefined = target.element;
        at !== undefined && at !== DOCUMENT;
        at = PARENTS[at]
      ) {
        yield at;
      }
    },
    childrenOf: (node) => Object.keys(PARENTS).filter((child) => PARENTS[child] === node),
    watchSizes: sizes.make,
    watchStructure: structure.make,
    watchStyle: styles.make,
    scheduler,
    placementEvents: new Set(),
  };
  return {
    host,
    targets,
    rects,
    reads: () => reads,
    frames: () => queued.size,
    tick: (): void => {
      const due = [...queued.values()];
      queued.clear();
      for (const callback of due) callback(0);
    },
    sizes: sizes.watch,
    structure: structure.watch,
    styles: styles.watch,
  };
}

const AT: LiveRect = { x: 10, y: 20, width: 100, height: 100 };

const CLIP: LiveRect = { x: 0, y: 0, width: 400, height: 800 };

function placedHost(): Fake {
  const fake = fakeHost();
  fake.rects.set('view', AT);
  fake.rects.set('scroll', CLIP);
  fake.targets.push({ element: 'view', clips: ['scroll'] });
  return fake;
}

function place(fake: Fake): void {
  for (const listener of fake.host.placementEvents) listener();
}

describe('the live view layout watch', () => {
  it('reads no layout while a burst of mutations arrives, then reads it once in the next frame', () => {
    const fake = placedHost();
    let moved = 0;
    watchLayout(fake.host, () => {
      moved += 1;
    });
    const before = fake.reads();
    for (let at = 0; at < 60; at += 1) {
      fake.structure.fire();
      fake.styles.fire();
    }
    expect(fake.reads()).toBe(before);
    expect(fake.frames()).toBe(1);
    fake.tick();
    expect(fake.reads()).toBe(before + 2);
    expect(moved).toBe(0);
  });

  it('reports a move found in the next frame', () => {
    const fake = placedHost();
    let moved = 0;
    watchLayout(fake.host, () => {
      moved += 1;
    });
    fake.rects.set('view', { ...AT, y: 60 });
    fake.structure.fire();
    expect(moved).toBe(0);
    fake.tick();
    expect(moved).toBe(1);
    fake.styles.fire();
    fake.tick();
    expect(moved).toBe(1);
  });

  it('watches the nearest clip and the ancestor chain, never the whole document', () => {
    const fake = placedHost();
    watchLayout(fake.host, () => undefined);
    expect([...fake.structure.observed]).toEqual(['scroll']);
    expect([...fake.styles.observed]).toEqual(['view', 'card', 'content', 'scroll', 'screen']);
    expect([...fake.sizes.observed]).toEqual(['view', 'scroll', 'content']);
    expect(fake.structure.observed.has(DOCUMENT)).toBe(false);
    expect(fake.styles.observed.has(DOCUMENT)).toBe(false);
  });

  it('observes and reads nothing while no view is placed', () => {
    const fake = fakeHost();
    watchLayout(fake.host, () => undefined);
    place(fake);
    fake.structure.fire();
    fake.styles.fire();
    expect(
      fake.structure.observed.size + fake.styles.observed.size + fake.sizes.observed.size,
    ).toBe(0);
    expect(fake.frames()).toBe(0);
    expect(fake.reads()).toBe(0);
  });

  it('checks a size change at once, after layout', () => {
    const fake = placedHost();
    let moved = 0;
    watchLayout(fake.host, () => {
      moved += 1;
    });
    fake.rects.set('scroll', { ...CLIP, height: 600 });
    fake.sizes.fire();
    expect(moved).toBe(1);
    expect(fake.frames()).toBe(0);
  });

  it('cancels a pending frame and stops observing when disposed', () => {
    const fake = placedHost();
    const stop = watchLayout(fake.host, () => undefined);
    fake.structure.fire();
    stop();
    expect(fake.frames()).toBe(0);
    expect(
      fake.structure.observed.size + fake.styles.observed.size + fake.sizes.observed.size,
    ).toBe(0);
    expect(fake.host.placementEvents.size).toBe(0);
  });
});
