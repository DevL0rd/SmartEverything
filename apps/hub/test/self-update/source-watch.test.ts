import { setImmediate } from 'node:timers/promises';
import { expect, it, vi } from 'vitest';
import { watchHubUpdateSource } from '../../src/self-update/source-watch';

const FIRST_TIP = 'a'.repeat(40);
const NEXT_TIP = 'b'.repeat(40);

function asked(source: { readonly refresh: () => void }): () => Promise<void> {
  return async (): Promise<void> => {
    source.refresh();
    await setImmediate();
  };
}

it('announces the first tip, branch changes, source loss and recovery once each', async () => {
  const unavailable = new Error('Fixture Git branch is unavailable');
  const probe = vi
    .fn<(signal: AbortSignal) => Promise<string>>()
    .mockRejectedValueOnce(unavailable)
    .mockResolvedValueOnce(FIRST_TIP)
    .mockResolvedValueOnce(FIRST_TIP)
    .mockResolvedValueOnce(NEXT_TIP)
    .mockRejectedValueOnce(unavailable)
    .mockRejectedValueOnce(unavailable)
    .mockResolvedValueOnce(NEXT_TIP);
  const changed = vi.fn().mockResolvedValue(undefined);
  const source = watchHubUpdateSource({
    probe,
    changed,
    events: (): (() => void) => () => undefined,
  });
  const tick = asked(source);
  try {
    await setImmediate();
    expect(changed).not.toHaveBeenCalled();
    expect(probe).toHaveBeenCalledOnce();
    const expectedNotices = [1, 1, 2, 3, 3, 4] as const;
    for (const notices of expectedNotices) {
      await tick();
      expect(changed).toHaveBeenCalledTimes(notices);
    }
    expect(probe).toHaveBeenCalledTimes(7);
  } finally {
    await source.stop();
  }
});

it('keeps one probe in flight and aborts it on stop without announcing', async () => {
  const cancelled = vi.fn();
  const probe = vi.fn(
    (signal: AbortSignal) =>
      new Promise<string>((resolve) => {
        signal.addEventListener('abort', () => {
          cancelled();
          resolve(FIRST_TIP);
        });
      }),
  );
  const changed = vi.fn().mockResolvedValue(undefined);
  const source = watchHubUpdateSource({
    probe,
    changed,
    events: (): (() => void) => () => undefined,
  });
  expect(probe).toHaveBeenCalledOnce();
  await asked(source)();
  await asked(source)();
  expect(probe).toHaveBeenCalledOnce();
  await source.stop();
  expect(cancelled).toHaveBeenCalledOnce();
  expect(changed).not.toHaveBeenCalled();
});
