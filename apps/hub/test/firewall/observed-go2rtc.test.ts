import { describe, expect, it } from 'vitest';
import { Go2rtcError, type Go2rtcClient, type Go2rtcMotor } from '../../src/cameras/go2rtc-client';
import {
  CameraBlockedByFirewallError,
  observedGo2rtc,
  type StreamWatch,
} from '../../src/firewall/observed-go2rtc';

type Calls = string[];

function client(calls: Calls, failure: Error | null = null): Go2rtcClient & Go2rtcMotor {
  const run = <T>(name: string, value: T): Promise<T> => {
    calls.push(name);
    return failure === null ? Promise.resolve(value) : Promise.reject(failure);
  };
  return {
    putStream: () => run('putStream', undefined),
    deleteStream: () => run('deleteStream', undefined),
    answer: () => run('answer', 'sdp-answer'),
    frame: () => run('frame', new Uint8Array([1])),
    consumers: () => run('consumers', []),
    closeConsumer: () => run('closeConsumer', undefined),
    clip: () => run('clip', new Uint8Array([2])),
    play: () => run('play', undefined),
    socketOf: () => ({ url: 'ws://go2rtc', authorization: 'Basic x' }),
    motor: () => run('motor', undefined),
  };
}

function watch(blocking: string | null, log: string[]): StreamWatch {
  return {
    streamOpening: (id) => log.push(`opening ${id}`),
    streamSettled: (id, ok) => log.push(`settled ${id} ${String(ok)}`),
    blockingAddress: () => blocking,
  };
}

const REFUSED = new Go2rtcError('answer', 500, 'no route');

describe('observedGo2rtc', () => {
  it('tells the watch a stream is opening and settled when the call succeeds', async () => {
    const log: string[] = [];
    const observed = observedGo2rtc(client([]), watch(null, log));
    await expect(observed.answer('cam', 'offer')).resolves.toBe('sdp-answer');
    expect(log).toEqual(['opening cam', 'settled cam true']);
  });

  it('observes answer, frame and clip and passes other calls straight through', async () => {
    const log: string[] = [];
    const calls: Calls = [];
    const observed = observedGo2rtc(client(calls), watch(null, log));
    await observed.frame('cam', 'thumb', new AbortController().signal);
    await observed.clip('cam', 5);
    await observed.putStream('cam', ['rtsp://x']);
    await observed.motor('cam', 1);
    expect(log).toEqual(['opening cam', 'settled cam true', 'opening cam', 'settled cam true']);
    expect(calls).toEqual(['frame', 'clip', 'putStream', 'motor']);
    expect(observed.socketOf('cam')).toEqual({ url: 'ws://go2rtc', authorization: 'Basic x' });
  });

  it('rethrows the go2rtc refusal when the firewall is not blocking that stream', async () => {
    const log: string[] = [];
    const observed = observedGo2rtc(client([], REFUSED), watch(null, log));
    await expect(observed.answer('cam', 'offer')).rejects.toBe(REFUSED);
    expect(log).toEqual(['opening cam', 'settled cam false']);
  });

  it('blames the firewall when a go2rtc refusal hits a stream with a blocked address', async () => {
    const observed = observedGo2rtc(client([], REFUSED), watch('192.168.1.50', []));
    const error = await observed.answer('cam', 'offer').catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(CameraBlockedByFirewallError);
    expect(error).toMatchObject({ deviceId: 'cam', address: '192.168.1.50' });
    expect(String(error)).toContain('192.168.1.50');
    expect(String(error)).toContain(REFUSED.message);
  });

  it('does not blame the firewall for an error that did not come from go2rtc', async () => {
    const failure = new Error('socket hang up');
    const observed = observedGo2rtc(client([], failure), watch('192.168.1.50', []));
    await expect(observed.clip('cam', 5)).rejects.toBe(failure);
  });
});
