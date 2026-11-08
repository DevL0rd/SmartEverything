import { describe, expect, it, vi } from 'vitest';
import { ThumbnailQueue } from './thumbnail-queue';

async function settle(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

function held(): {
  readonly load: ReturnType<typeof vi.fn<() => Promise<void>>>;
  readonly finish: () => void;
} {
  let finish = (): void => undefined;
  const promise = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return {
    load: vi.fn(() => promise),
    finish: (): void => {
      finish();
    },
  };
}

describe('thumbnail request admission', () => {
  it('counts uncancellable old requests against the bound during rapid viewport changes', async () => {
    const queue = new ThumbnailQueue(vi.fn());
    const first = held();
    const second = held();
    const latest = held();
    queue.resize(1);
    const removeFirst = queue.request('first', first.load);
    await settle();
    removeFirst();
    const removeSecond = queue.request('second', second.load);
    removeSecond();
    queue.request('latest', latest.load);
    await settle();
    expect(first.load).toHaveBeenCalledTimes(1);
    expect(second.load).not.toHaveBeenCalled();
    expect(latest.load).not.toHaveBeenCalled();
    first.finish();
    await settle();
    expect(second.load).not.toHaveBeenCalled();
    expect(latest.load).toHaveBeenCalledTimes(1);
    latest.finish();
    await settle();
  });

  it('deduplicates an active key and pauses admission while backgrounded', async () => {
    const queue = new ThumbnailQueue(vi.fn());
    const first = held();
    const second = held();
    queue.resize(1);
    queue.request('first', first.load);
    queue.request('first', first.load);
    queue.request('second', second.load);
    await settle();
    queue.resize(0);
    first.finish();
    await settle();
    expect(first.load).toHaveBeenCalledTimes(1);
    expect(second.load).not.toHaveBeenCalled();
    queue.resize(1);
    await settle();
    expect(first.load).toHaveBeenCalledTimes(1);
    expect(second.load).toHaveBeenCalledTimes(1);
    second.finish();
    await settle();
  });
});
