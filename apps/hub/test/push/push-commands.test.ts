import { describe, expect, it } from 'vitest';
import { PushCommandChannel } from '../../src/extensions/push/commands';

const ACTION = { requestId: crypto.randomUUID(), deviceId: crypto.randomUUID(), action: 'find' };

describe('PushCommandChannel over /live', () => {
  it('delivers a watch action once, as a push_command notice, and skips the push service', async () => {
    const channel = new PushCommandChannel();
    const notices: unknown[] = [];
    const pushed: unknown[] = [];
    channel.attachLive((_clientId, notice) => {
      notices.push(notice);
      return Promise.resolve(1);
    });
    channel.attach((_clientId, data) => {
      pushed.push(data);
      return Promise.resolve({ outcome: 'sent' });
    });
    const outcome = await channel.send({
      clientId: 'phone',
      command: 'watch_action',
      payload: ACTION,
    });
    expect(outcome).toStrictEqual({ outcome: 'sent' });
    expect(notices).toStrictEqual([
      { type: 'push_command', command: 'watch_action', payload: ACTION },
    ]);
    expect(pushed).toHaveLength(0);
  });

  it('falls back to the push service when no connection took the notice', async () => {
    const channel = new PushCommandChannel();
    const pushed: unknown[] = [];
    channel.attachLive(() => Promise.resolve(0));
    channel.attach((_clientId, data) => {
      pushed.push(data);
      return Promise.resolve({ outcome: 'sent' });
    });
    await channel.send({ clientId: 'phone', command: 'watch_action', payload: ACTION });
    expect(pushed).toHaveLength(1);
  });
});
