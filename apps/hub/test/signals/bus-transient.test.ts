import { WEBHOOK_SOURCE, type SignalInput } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { SignalBus } from '../../src/signals/bus';
import { testLogger } from '../support/logs';

function call(field: string): SignalInput {
  return {
    source: WEBHOOK_SOURCE,
    kind: 'received',
    subject: null,
    field,
    value: true,
    previous: null,
    at: '2026-10-19T10:00:00.000Z',
    profileId: null,
    data: { method: 'POST', headers: { authorization: 'Bearer secret' }, request: 'token' },
  };
}

describe('signals that are not kept as the newest', () => {
  it('delivers a webhook call to the listeners and keeps nothing of it for later reads', () => {
    const bus = new SignalBus({ log: testLogger('signals') });
    const heard: SignalInput[] = [];
    bus.subscribe((signal) => heard.push(signal));
    for (let index = 0; index < 50; index += 1) bus.emit(call(`path-${String(index)}`));
    expect(heard).toHaveLength(50);
    expect(bus.latest({ source: WEBHOOK_SOURCE })).toStrictEqual([]);
  });
});
