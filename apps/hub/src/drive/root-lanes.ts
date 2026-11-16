import { background } from '@smarteverything/logging';

interface RootState {
  exclusive: Promise<void>;
  readonly shared: Set<Promise<void>>;
  readonly keys: Map<number, Promise<void>>;
}

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

  shared<T>(rootId: string, key: number, work: () => Promise<T>): Promise<T> {
    const state = this.stateOf(rootId);
    const before = Promise.all([state.exclusive, state.keys.get(key)]);
    const result = before.then(work);
    const done = settled(result);
    state.shared.add(done);
    state.keys.set(key, done);
    background(
      done.then(() => {
        state.shared.delete(done);
        if (state.keys.get(key) === done) state.keys.delete(key);
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
