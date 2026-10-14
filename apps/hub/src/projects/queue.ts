import { ApiError } from '@smarteverything/domain';
export class ProjectQueue {
  private readonly tails = new Map<string, Promise<void>>();
  private readonly counts = new Map<string, number>();
  async run<T>(chat: string, work: () => Promise<T>): Promise<T> {
    const count = this.counts.get(chat) ?? 0;
    if (count >= 128)
      throw new ApiError('conflict', 'The managed project operation queue is full.');
    this.counts.set(chat, count + 1);
    const previous = this.tails.get(chat) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate);
    this.tails.set(chat, tail);
    if (release === undefined)
      throw new ApiError('internal', 'The managed queue did not initialize its release gate.');
    const finish = release;
    await previous;
    try {
      return await work();
    } finally {
      finish();
      const remaining = (this.counts.get(chat) ?? 1) - 1;
      if (remaining === 0) this.counts.delete(chat);
      else this.counts.set(chat, remaining);
      if (this.tails.get(chat) === tail) this.tails.delete(chat);
    }
  }
  drain(chat: string): Promise<void> {
    return this.tails.get(chat) ?? Promise.resolve();
  }
}
