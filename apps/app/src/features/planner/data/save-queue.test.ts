import { describe, expect, it, vi } from 'vitest';
import { createSaveQueue } from './save-queue';

interface Held {
  readonly change: Readonly<Record<string, unknown>>;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
}

function heldQueue(): {
  readonly sent: Held[];
  readonly failed: ReturnType<typeof vi.fn>;
  readonly queue: ReturnType<typeof createSaveQueue<Readonly<Record<string, unknown>>>>;
} {
  const sent: Held[] = [];
  const failed = vi.fn();
  const queue = createSaveQueue<Readonly<Record<string, unknown>>>({
    event: 'test.save',
    send: (change) =>
      new Promise<void>((resolve, reject) => {
        sent.push({ change, resolve, reject });
      }),
    failed,
  });
  return { sent, failed, queue };
}

async function settled(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('the background save queue', () => {
  it('keeps every edit made while a save is held open and sends them next as one change', async () => {
    const { sent, queue } = heldQueue();
    queue.push({ snooze_minutes: 6 });
    expect(sent.map((entry) => entry.change)).toEqual([{ snooze_minutes: 6 }]);
    queue.push({ snooze_minutes: 7 });
    queue.push({ label: 'Gym' });
    expect(sent).toHaveLength(1);
    expect(queue.unsaved()).toEqual({ snooze_minutes: 7, label: 'Gym' });
    sent[0]?.resolve();
    await settled();
    expect(sent.map((entry) => entry.change)).toEqual([
      { snooze_minutes: 6 },
      { snooze_minutes: 7, label: 'Gym' },
    ]);
    expect(queue.unsaved()).toEqual({ snooze_minutes: 7, label: 'Gym' });
    sent[1]?.resolve();
    await settled();
    expect(queue.unsaved()).toBeNull();
  });

  it('tells listeners about each change without polling', async () => {
    const { sent, queue } = heldQueue();
    const listener = vi.fn();
    const off = queue.subscribe(listener);
    queue.push({ vibrate: false });
    expect(listener).toHaveBeenCalledTimes(1);
    sent[0]?.resolve();
    await settled();
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    queue.push({ vibrate: true });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('reports a failed save with its reason and still sends the edits that came after it', async () => {
    const { sent, failed, queue } = heldQueue();
    queue.push({ time: '07:30' });
    queue.push({ label: 'Run' });
    const refused = new Error('the hub refused the time');
    sent[0]?.reject(refused);
    await settled();
    expect(failed).toHaveBeenCalledWith(refused, { time: '07:30' });
    expect(sent[1]?.change).toEqual({ label: 'Run' });
    expect(queue.unsaved()).toEqual({ label: 'Run' });
  });
});
