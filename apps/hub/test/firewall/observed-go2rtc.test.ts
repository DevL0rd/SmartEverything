import { describe, expect, it } from 'vitest';
import { CameraOfflineError } from '../../src/cameras/camera-service';
import { Go2rtcError, type Go2rtcClient, type Go2rtcMotor } from '../../src/cameras/go2rtc-client';
import {
  CameraBlockedByFirewallError,
  CameraLoad,
  observedGo2rtc,
  type CameraWatch,
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
    preload: () => run('preload', undefined),
    unpreload: () => run('unpreload', undefined),
    answer: () => run('answer', 'sdp-answer'),
    frame: () => run('frame', new Uint8Array([1])),
    consumers: () => run('consumers', []),
    closeConsumer: () => run('closeConsumer', undefined),
    clip: () => run('clip', new Uint8Array([2])),
    play: () => run('play', undefined),
    backchannel: () => run('backchannel', true),
    socketOf: () => ({ url: 'ws://go2rtc', authorization: 'Basic x' }),
    motor: () => run('motor', undefined),
  };
}

function watch(blocking: string | null, log: string[], refusal: Error | null = null): CameraWatch {
  return {
    load: new CameraLoad(),
    refusal: (id): CameraOfflineError | null => {
      log.push(`asked ${id}`);
      return refusal instanceof CameraOfflineError ? refusal : null;
    },
    failed: (id): void => {
      log.push(`failed ${id}`);
    },
    recovered: (id): void => {
      log.push(`recovered ${id}`);
    },
    blockingAddress: () => blocking,
  };
}

const REFUSED = new Go2rtcError('answer', 500, 'no route');
const UDP_TIMEOUT = new Go2rtcError(
  'webrtc.offer',
  500,
  'streams: read udp [::]:41630: i/o timeout',
);

describe('observedGo2rtc', () => {
  it('reports a recovery when the call succeeds', async () => {
    const log: string[] = [];
    const observed = observedGo2rtc(client([]), watch(null, log));
    await expect(observed.answer('cam', 'offer')).resolves.toBe('sdp-answer');
    expect(log).toEqual(['asked cam', 'recovered cam']);
  });

  it('observes answer, frame, clip and play and passes other calls straight through', async () => {
    const log: string[] = [];
    const calls: Calls = [];
    const observed = observedGo2rtc(client(calls), watch(null, log));
    await observed.frame('cam', 'thumb', new AbortController().signal);
    await observed.clip('cam', 5);
    await observed.putStream('cam', ['rtsp://x']);
    await observed.motor('cam', 1);
    expect(log).toEqual(['asked cam', 'recovered cam', 'asked cam', 'recovered cam']);
    expect(calls).toEqual(['frame', 'clip', 'putStream', 'motor']);
    expect(observed.socketOf('cam')).toEqual({ url: 'ws://go2rtc', authorization: 'Basic x' });
  });

  it('refuses at once, without calling go2rtc, a camera already known to be down', async () => {
    const calls: Calls = [];
    const down = new CameraOfflineError('cam');
    const observed = observedGo2rtc(client(calls), watch(null, [], down));
    await expect(observed.answer('cam', 'offer')).rejects.toBe(down);
    await expect(observed.frame('cam', 'full', new AbortController().signal)).rejects.toBe(down);
    await expect(observed.clip('cam', 5)).rejects.toBe(down);
    await expect(observed.play('cam', 'ffmpeg:x')).rejects.toBe(down);
    expect(calls).toEqual([]);
  });

  it('marks the camera down when go2rtc gives up on a UDP read timeout', async () => {
    const log: string[] = [];
    const observed = observedGo2rtc(client([], UDP_TIMEOUT), watch(null, log));
    await expect(observed.answer('cam', 'offer')).rejects.toBe(UDP_TIMEOUT);
    expect(log).toEqual(['asked cam', 'failed cam']);
  });

  it('marks the camera down when a frame request is aborted at its deadline', async () => {
    const log: string[] = [];
    const controller = new AbortController();
    const aborted = new Error('aborted');
    const hanging: Go2rtcClient & Go2rtcMotor = {
      ...client([]),
      frame: () => {
        controller.abort();
        return Promise.reject(aborted);
      },
    };
    const observed = observedGo2rtc(hanging, watch(null, log));
    await expect(observed.frame('cam', 'thumb', controller.signal)).rejects.toBe(aborted);
    expect(log).toEqual(['asked cam', 'failed cam']);
  });

  it('does not mark the camera down for a go2rtc refusal that is not a timeout', async () => {
    const log: string[] = [];
    const observed = observedGo2rtc(client([], REFUSED), watch(null, log));
    await expect(observed.answer('cam', 'offer')).rejects.toBe(REFUSED);
    expect(log).toEqual(['asked cam']);
  });

  it('blames the firewall when a go2rtc refusal hits a stream with a blocked address', async () => {
    const observed = observedGo2rtc(client([], REFUSED), watch('192.168.1.50', []));
    const error = await observed.answer('cam', 'offer').catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(CameraBlockedByFirewallError);
    expect(error).toMatchObject({ deviceId: 'cam', address: '192.168.1.50' });
    expect(String(error)).toContain('192.168.1.50');
    expect(String(error)).toContain(REFUSED.message);
  });

  it('blames the firewall when go2rtc refuses to play a channel on a blocked camera', async () => {
    const refused = new Go2rtcError('streams.play', 500, "can't find consumer");
    const observed = observedGo2rtc(client([], refused), watch('192.168.1.50', []));
    const error = await observed.play('cam', 'ffmpeg:x').catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(CameraBlockedByFirewallError);
  });

  it('does not blame the firewall for an error that did not come from go2rtc', async () => {
    const failure = new Error('socket hang up');
    const observed = observedGo2rtc(client([], failure), watch('192.168.1.50', []));
    await expect(observed.clip('cam', 5)).rejects.toBe(failure);
  });

  it('counts the requests open against each camera and forgets them when they end', async () => {
    const load = new CameraLoad();
    const releases: (() => void)[] = [];
    const slow: Go2rtcClient & Go2rtcMotor = {
      ...client([]),
      clip: () =>
        new Promise<Uint8Array>((resolve) => {
          releases.push(() => {
            resolve(new Uint8Array([2]));
          });
        }),
    };
    const observed = observedGo2rtc(slow, { ...watch(null, []), load });
    const pending = observed.clip('cam', 5);
    const second = observed.clip('cam', 5);
    expect(load.of('cam')).toStrictEqual({ clip: 2 });
    expect(load.of('other')).toStrictEqual({});
    releases.forEach((release) => {
      release();
    });
    await Promise.all([pending, second]);
    expect(load.of('cam')).toStrictEqual({});
  });
});
