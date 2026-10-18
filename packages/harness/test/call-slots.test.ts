import { describe, expect, it } from 'vitest';
import { CallCancelledError, CallSlots } from '../src/providers/call-slots';

describe('supplier call slots', () => {
  it('queues calls past the limit and starts them in order as slots free up', async () => {
    const slots = new CallSlots(2);
    const order: string[] = [];
    const run = async (name: string): Promise<void> => {
      await slots.acquire(new AbortController().signal);
      order.push(name);
    };

    await run('a');
    await run('b');
    const third = run('c');
    const fourth = run('d');
    await Promise.resolve();
    expect(order).toStrictEqual(['a', 'b']);

    slots.release();
    await third;
    expect(order).toStrictEqual(['a', 'b', 'c']);

    slots.release();
    await fourth;
    expect(order).toStrictEqual(['a', 'b', 'c', 'd']);
  });

  it('lets a queued call leave when it is cancelled, without taking or losing a slot', async () => {
    const slots = new CallSlots(1);
    await slots.acquire(new AbortController().signal);
    const cancel = new AbortController();
    const waiting = slots.acquire(cancel.signal);
    const refused = expect(waiting).rejects.toBeInstanceOf(CallCancelledError);

    cancel.abort('cancelled');
    await refused;

    slots.release();
    await expect(slots.acquire(new AbortController().signal)).resolves.toBeUndefined();
  });

  it('refuses a call that is already cancelled', async () => {
    const slots = new CallSlots(1);
    const cancel = new AbortController();
    cancel.abort(new Error('stopped'));

    await expect(slots.acquire(cancel.signal)).rejects.toThrow('stopped');
  });
});
