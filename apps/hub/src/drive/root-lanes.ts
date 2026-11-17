import { background } from '@smarteverything/logging';

interface RootState {
  exclusive: Promise<void>;
  readonly shared: Set<Promise<void>>;
  readonly keys: Map<LaneKey, Promise<void>>;
}

export type LaneKey = number | string;

function settled(work: Promise<unknown>): Promise<void> {
  return work.then(
    () => undefined,
    () => undefined,
  );
}

export class DriveRootLanes {
  private readonly roots = new Map<string, RootState>();

  run<T>(rootIds: readonly string[], work: () => Promise<T>): Promise<T> {
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const waits = [...new Set(rootIds)].map((rootId) => {
      const state = this.stateOf(rootId);
      const before = Promise.all([state.exclusive, ...state.shared]);
      state.exclusive = held;
      this.forget(rootId, state, held);
      return before;
    });
    const result = Promise.all(waits).then(work);
    background(settled(result).then(release), 'drive.lane_release_failed');
    return result;
  }

  shared<T>(rootId: string, key: LaneKey, work: () => Promise<T>): Promise<T> {
    return this.staged(rootId, key, () => work());
  }

  staged<T>(
    rootId: string,
    key: LaneKey,
    work: (handoff: () => void) => Promise<T>,
  ): Promise<T> {
    const state = this.stateOf(rootId);
    const before = Promise.all([state.exclusive, state.keys.get(key)]);
    let handoff = (): void => undefined;
    const handed = new Promise<void>((resolve) => {
      handoff = resolve;
    });
    const result = before.then(() => work(handoff));
    const done = settled(result);
    const keyed = Promise.race([handed, done]);
    state.shared.add(done);
    state.keys.set(key, keyed);
    background(
      keyed.then(() => {
        if (state.keys.get(key) === keyed) state.keys.delete(key);
      }),
      'drive.lane_release_failed',
    );
    background(
      done.then(() => {
        state.shared.delete(done);
      }),
      'drive.lane_release_failed',
    );
    this.forget(rootId, state, done);
    return result;
  }

  private stateOf(rootId: string): RootState {
    let state = this.roots.get(rootId);
    if (state === undefined) {
      state = { exclusive: Promise.resolve(), shared: new Set(), keys: new Map() };
      this.roots.set(rootId, state);
    }
    return state;
  }

  private forget(rootId: string, state: RootState, done: Promise<void>): void {
    background(
      done.then(() => {
        if (state.shared.size === 0 && state.keys.size === 0 && state.exclusive === done)
          this.roots.delete(rootId);
      }),
      'drive.lane_release_failed',
    );
  }
}
