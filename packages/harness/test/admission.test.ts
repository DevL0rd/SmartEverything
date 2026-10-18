import { describe, expect, it } from 'vitest';
import { HarnessAdmission } from '../src/host/admission';

function gate(): { readonly open: () => void; readonly wait: Promise<void> } {
  let open: () => void = () => undefined;
  const wait = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, wait };
}

describe('harness admission lanes', () => {
  it('runs operations of one lane one after another', async () => {
    const admission = new HarnessAdmission();
    const order: string[] = [];
    const slow = gate();

    const first = admission.run(async () => {
      order.push('first:start');
      await slow.wait;
      order.push('first:end');
    }, 'chat-a');
    const second = admission.run(() => {
      order.push('second');
      return Promise.resolve();
    }, 'chat-a');
    await Promise.resolve();
    slow.open();
    await Promise.all([first, second]);

    expect(order).toStrictEqual(['first:start', 'first:end', 'second']);
  });

  it('does not let a slow operation of one chat delay another chat', async () => {
    const admission = new HarnessAdmission();
    const slow = gate();
    const blocked = admission.run(() => slow.wait, 'chat-a');

    const other = await admission.run(() => Promise.resolve('done'), 'chat-b');

    expect(other).toBe('done');
    slow.open();
    await blocked;
  });

  it('makes shared work wait for every lane and lets later lane work wait for it', async () => {
    const admission = new HarnessAdmission();
    const slow = gate();
    const order: string[] = [];
    const lane = admission.run(async () => {
      await slow.wait;
      order.push('lane');
    }, 'chat-a');
    const shared = admission.run(async () => {
      order.push('shared:start');
      await slow.wait;
      order.push('shared:end');
    });
    const later = admission.run(() => {
      order.push('later');
      return Promise.resolve();
    }, 'chat-b');
    await Promise.resolve();
    slow.open();
    await Promise.all([lane, shared, later]);

    expect(order).toStrictEqual(['lane', 'shared:start', 'shared:end', 'later']);
  });

  it('keeps going in a lane after one of its operations failed', async () => {
    const admission = new HarnessAdmission();

    await expect(admission.run(() => Promise.reject(new Error('boom')), 'chat-a')).rejects.toThrow(
      'boom',
    );

    expect(await admission.run(() => Promise.resolve('next'), 'chat-a')).toBe('next');
  });

  it('waits for every lane before shutting down and then refuses new work', async () => {
    const admission = new HarnessAdmission();
    const slow = gate();
    const order: string[] = [];
    const running = admission.run(async () => {
      await slow.wait;
      order.push('lane');
    }, 'chat-a');

    const shutdown = admission.shutdown(() => {
      order.push('shutdown');
      return Promise.resolve();
    });
    slow.open();
    await Promise.all([running, shutdown]);

    expect(order).toStrictEqual(['lane', 'shutdown']);
    await expect(admission.run(() => Promise.resolve(), 'chat-a')).rejects.toThrow(/disposing/u);
  });
});
