import { background } from '@smarteverything/logging';
export class CommandLanes {
  private readonly tails = new Map<string, Promise<void>>();
  run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const result = previous.then(work);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(key, tail);
    background(
      tail.then(() => {
        if (this.tails.get(key) === tail) this.tails.delete(key);
      }),
      'lanes.background_failed',
    );
    return result;
  }
}
