import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger, type LogRecord } from '@smarteverything/logging';
import { z } from 'zod';
import {
  ShellyAuthenticationError,
  ShellyConnectionError,
  ShellyRpc,
  ShellyRpcError,
  shellyRpcFrame,
  type ShellyNotification,
} from '../src/rpc-entry';

const ID = 'shellypresencegen4-aabbcc';
const CHALLENGE = JSON.stringify({
  auth_type: 'digest',
  nonce: 'nonce1',
  realm: ID,
  algorithm: 'SHA-256',
});

class Fixture {
  readonly sent: Record<string, unknown>[] = [];
  readonly notifications: ShellyNotification[] = [];
  readonly closed: unknown[] = [];
  closes = 0;
  sendFails = false;
  readonly rpc: ShellyRpc;

  constructor(password: string | null = null) {
    this.rpc = new ShellyRpc({
      id: ID,
      password,
      requestMs: 1000,
      transport: {
        send: (text): void => {
          if (this.sendFails) throw new Error('socket gone');
          const frame: unknown = JSON.parse(text);
          if (typeof frame === 'object' && frame !== null) this.sent.push({ ...frame });
        },
        close: (): void => {
          this.closes += 1;
        },
      },
      notification: (notification): void => {
        this.notifications.push(notification);
      },
      closed: (cause): void => {
        this.closed.push(cause);
      },
    });
  }

  src(index: number): string {
    return String(this.sent[index]?.['src']);
  }

  reply(index: number, body: Record<string, unknown>, from = ID): void {
    this.rpc.receive(
      JSON.stringify({ id: this.sent[index]?.['id'], src: from, dst: this.src(index), ...body }),
    );
  }
}

const NUMBER = z.object({ value: z.number() });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('calls', () => {
  it('sends a request and resolves with the parsed result and its sequence', async () => {
    const fixture = new Fixture();
    const call = fixture.rpc.observedCall('Presence.GetStatus', { id: 0 }, NUMBER);
    expect(fixture.sent[0]).toMatchObject({ method: 'Presence.GetStatus', params: { id: 0 } });
    fixture.reply(0, { result: { value: 3 } });
    await expect(call).resolves.toEqual({ value: { value: 3 }, sequence: 1 });
  });

  it('returns only the value from call', async () => {
    const fixture = new Fixture();
    const call = fixture.rpc.call('Shelly.GetStatus', {}, NUMBER);
    fixture.reply(0, { result: { value: 5 } });
    await expect(call).resolves.toEqual({ value: 5 });
  });

  it('turns a device error into a typed error', async () => {
    const fixture = new Fixture();
    const call = fixture.rpc.call('Shelly.Nope', {}, NUMBER);
    fixture.reply(0, { error: { code: -105, message: 'Argument not found' } });
    await expect(call).rejects.toMatchObject({
      name: 'ShellyRpcError',
      method: 'Shelly.Nope',
      code: -105,
    });
    await expect(call).rejects.toBeInstanceOf(ShellyRpcError);
  });

  it('rejects a reply without a result', async () => {
    const fixture = new Fixture();
    const call = fixture.rpc.call('Shelly.GetStatus', {}, NUMBER);
    fixture.reply(0, {});
    await expect(call).rejects.toMatchObject({ reason: 'the reply has no result' });
  });

  it('times out and reports an unknown outcome', async () => {
    const fixture = new Fixture();
    const call = fixture.rpc.call('Shelly.GetStatus', {}, NUMBER);
    const outcome = expect(call).rejects.toMatchObject({
      reason: 'the reply timed out; the outcome is unknown',
    });
    await vi.advanceTimersByTimeAsync(1000);
    await outcome;
  });

  it('uses the default timeout when none is given', async () => {
    const closed: unknown[] = [];
    const rpc = new ShellyRpc({
      id: ID,
      password: null,
      transport: { send: (): void => undefined, close: (): void => undefined },
      notification: (): void => undefined,
      closed: (cause): void => {
        closed.push(cause);
      },
    });
    const call = rpc.call('Shelly.GetStatus', {}, NUMBER);
    const outcome = expect(call).rejects.toBeInstanceOf(ShellyConnectionError);
    await vi.advanceTimersByTimeAsync(9999);
    expect(closed).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await outcome;
  });

  it('reports a failed send as an unknown outcome', async () => {
    const fixture = new Fixture();
    fixture.sendFails = true;
    await expect(fixture.rpc.call('Shelly.GetStatus', {}, NUMBER)).rejects.toMatchObject({
      reason: 'the send failed; the outcome is unknown',
    });
  });
});

describe('authentication', () => {
  it('answers a 401 challenge and retries', async () => {
    const fixture = new Fixture('secret');
    const call = fixture.rpc.call('Shelly.GetStatus', {}, NUMBER);
    fixture.reply(0, { error: { code: 401, message: CHALLENGE } });
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.sent[1]).toMatchObject({ auth: { nonce: 'nonce1', username: 'admin' } });
    fixture.reply(1, { result: { value: 1 } });
    await expect(call).resolves.toEqual({ value: 1 });
  });

  it('reuses the answered challenge on the next call', async () => {
    const fixture = new Fixture('secret');
    const first = fixture.rpc.call('Shelly.GetStatus', {}, NUMBER);
    fixture.reply(0, { error: { code: 401, message: CHALLENGE } });
    await vi.advanceTimersByTimeAsync(0);
    fixture.reply(1, { result: { value: 1 } });
    await first;
    const second = fixture.rpc.call('Shelly.GetStatus', {}, NUMBER);
    expect(fixture.sent[2]).toMatchObject({ auth: { nonce: 'nonce1', nc: '00000002' } });
    fixture.reply(2, { result: { value: 2 } });
    await second;
  });

  it('gives up after repeated challenges', async () => {
    const fixture = new Fixture('secret');
    const call = fixture.rpc.call('Shelly.GetStatus', {}, NUMBER);
    const outcome = expect(call).rejects.toBeInstanceOf(ShellyAuthenticationError);
    for (let index = 0; index < 3; index += 1) {
      fixture.reply(index, { error: { code: 401, message: CHALLENGE } });
      await vi.advanceTimersByTimeAsync(0);
    }
    await outcome;
  });

  it('fails when a challenge arrives without a password', async () => {
    const fixture = new Fixture();
    const call = fixture.rpc.call('Shelly.GetStatus', {}, NUMBER);
    fixture.reply(0, { error: { code: 401, message: CHALLENGE } });
    await expect(call).rejects.toMatchObject({ reason: 'a local access password is required' });
  });

  it('uses a replaced password for later challenges', async () => {
    const fixture = new Fixture();
    fixture.rpc.setPassword('new');
    const call = fixture.rpc.call('Shelly.GetStatus', {}, NUMBER);
    fixture.reply(0, { error: { code: 401, message: CHALLENGE } });
    await vi.advanceTimersByTimeAsync(0);
    expect(fixture.sent[1]).toHaveProperty('auth');
    fixture.reply(1, { result: { value: 1 } });
    await call;
  });
});

describe('incoming frames', () => {
  it('passes notifications on with a growing sequence', () => {
    const fixture = new Fixture();
    fixture.rpc.receive(
      JSON.stringify({ src: ID, method: 'NotifyStatus', params: { ts: 1, 'presence:0': {} } }),
    );
    fixture.rpc.receive(JSON.stringify({ src: ID, method: 'NotifyEvent', params: { ts: 2 } }));
    expect(fixture.notifications.map((n) => [n.method, n.sequence])).toEqual([
      ['NotifyStatus', 1],
      ['NotifyEvent', 2],
    ]);
  });

  it('ignores frames for another destination and unknown replies', () => {
    const fixture = new Fixture();
    fixture.rpc.receive(JSON.stringify({ id: 0, src: ID, dst: 'someone-else', result: {} }));
    fixture.rpc.receive(JSON.stringify({ id: 99, src: ID, result: {} }));
    expect(fixture.notifications).toEqual([]);
    expect(fixture.closed).toEqual([]);
  });

  it('stops on malformed frames', () => {
    const fixture = new Fixture();
    fixture.rpc.receive('{');
    expect(fixture.closed[0]).toBeInstanceOf(ShellyConnectionError);
    expect(fixture.closes).toBe(1);
  });

  it('stops on frames with an invalid shape', () => {
    const fixture = new Fixture();
    fixture.rpc.receive(JSON.stringify({ src: '' }));
    expect(fixture.closed).toHaveLength(1);
  });

  it('stops when another device answers', async () => {
    const fixture = new Fixture();
    const call = fixture.rpc.call('Shelly.GetStatus', {}, NUMBER);
    const outcome = expect(call).rejects.toMatchObject({ operation: 'identity' });
    fixture.reply(0, { result: { value: 1 } }, 'shellyother');
    await outcome;
    expect(fixture.closes).toBe(1);
  });

  it('ignores frames after the connection stopped', () => {
    const fixture = new Fixture();
    fixture.rpc.close();
    fixture.rpc.receive(JSON.stringify({ src: ID, method: 'NotifyStatus' }));
    expect(fixture.notifications).toEqual([]);
  });
});

describe('closing', () => {
  it('rejects pending calls and reports the cause once', async () => {
    const fixture = new Fixture();
    const call = fixture.rpc.call('Shelly.GetStatus', {}, NUMBER);
    const outcome = expect(call).rejects.toMatchObject({ reason: 'the connection was stopped' });
    fixture.rpc.close();
    fixture.rpc.close();
    await outcome;
    expect(fixture.closed).toHaveLength(1);
    expect(fixture.closes).toBe(1);
  });

  it('refuses new calls once stopped', async () => {
    const fixture = new Fixture();
    fixture.rpc.fail(new Error('gone'));
    await expect(fixture.rpc.call('Shelly.GetStatus', {}, NUMBER)).rejects.toMatchObject({
      reason: 'the socket is offline',
    });
  });
});

describe('frame decoding', () => {
  it('decodes valid frames and refuses malformed JSON', () => {
    expect(shellyRpcFrame('{"src":"a","id":1}')).toEqual({ src: 'a', id: 1 });
    expect(() => shellyRpcFrame('{')).toThrow(ShellyConnectionError);
  });
});

describe('logging', () => {
  const records: LogRecord[] = [];

  beforeEach(() => {
    records.length = 0;
    Logger.configure({
      level: 'debug',
      sink: (record): void => {
        records.push(record);
      },
    });
  });
  afterEach(() => {
    Logger.reset();
  });

  function logged(event: string): LogRecord | undefined {
    return records.find((record) => record.event === event);
  }

  it('logs a reply with its method, sequence and outcome', async () => {
    const fixture = new Fixture();
    const call = fixture.rpc.call('Shelly.GetStatus', {}, NUMBER);
    fixture.reply(0, { error: { code: -1, message: 'no' } });
    await expect(call).rejects.toBeInstanceOf(ShellyRpcError);
    expect(logged('rpc.replied')?.payload).toMatchObject({
      method: 'Shelly.GetStatus',
      id: 0,
      sequence: 1,
      ok: false,
    });
  });

  it('names a cause that is not an error by its type when the connection closes', () => {
    const fixture = new Fixture();
    fixture.rpc.fail('gone');
    expect(logged('rpc.closed')?.payload).toMatchObject({ reason: 'string', pendingRequests: 0 });
  });

  it('names a send failure that is not an error by its type', async () => {
    const refused: unknown = 'refused';
    const rpc = new ShellyRpc({
      id: ID,
      password: null,
      transport: {
        send: (): void => {
          throw refused;
        },
        close: (): void => undefined,
      },
      notification: (): void => undefined,
      closed: (): void => undefined,
    });
    await expect(rpc.call('Shelly.GetStatus', {}, NUMBER)).rejects.toBeInstanceOf(
      ShellyConnectionError,
    );
    expect(logged('rpc.send_failed')?.payload).toMatchObject({ reason: 'string' });
  });
  it('logs a skipped frame with its id, or none for a notification', () => {
    const fixture = new Fixture();
    fixture.rpc.receive(JSON.stringify({ id: 7, src: ID, dst: 'someone-else', result: {} }));
    fixture.rpc.receive(JSON.stringify({ src: ID, dst: 'someone-else', method: 'NotifyEvent' }));
    const skipped = records.filter((record) => record.event === 'rpc.frame_skipped');
    expect(skipped.map((record) => record.payload)).toMatchObject([
      { reason: 'other_destination', id: 7 },
      { reason: 'other_destination', id: null },
    ]);
  });
});
