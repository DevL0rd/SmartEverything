import { beforeEach, describe, expect, it } from 'vitest';
import type { StreamConsumer } from '../src/cameras/go2rtc-client';
import { CameraViewers } from '../src/cameras/viewers';
import { captureLogs, testLogger, type CapturedLogs } from './support/logs';

const CAMERA = '2a000000-0000-4000-8000-000000000001';

interface FakeStream {
  readonly closed: number[];
  readonly open: (clientId: string, consumerId: number) => Promise<string>;
  readonly end: (consumerId: number) => void;
  readonly live: () => number[];
}

let logs: CapturedLogs;

beforeEach(() => {
  logs = captureLogs();
});

function fakeStream(): FakeStream {
  let consumers: StreamConsumer[] = [];
  const closed: number[] = [];
  const viewers = new CameraViewers(
    {
      consumers: (): Promise<readonly StreamConsumer[]> => Promise.resolve(consumers),
      closeConsumer: (_stream, id): Promise<void> => {
        closed.push(id);
        consumers = consumers.filter((consumer) => consumer.id !== id);
        return Promise.resolve();
      },
    },
    testLogger(),
  );
  return {
    closed,
    open: (clientId, consumerId) =>
      viewers.open({
        deviceId: CAMERA,
        clientId,
        kind: 'view',
        answer: (): Promise<string> => {
          consumers = [
            ...consumers,
            { id: consumerId, format: 'webrtc/tcp', remote: '10.0.0.2:5000', userAgent: '' },
          ];
          return Promise.resolve('answer');
        },
      }),
    end: (consumerId): void => {
      consumers = consumers.filter((consumer) => consumer.id !== consumerId);
    },
    live: () => consumers.map((consumer) => consumer.id),
  };
}

describe('camera viewers', () => {
  it('admits any number of simultaneous viewers of one camera', async () => {
    const stream = fakeStream();
    for (let client = 1; client <= 8; client += 1) {
      expect(await stream.open(`client-${String(client)}`, client)).toBe('answer');
    }
    expect(stream.live()).toStrictEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(stream.closed).toStrictEqual([]);
    expect(logs.events()).toContain('camera.consumers_high');
  });

  it('replaces only the same client session when it opens again', async () => {
    const stream = fakeStream();
    await stream.open('a', 1);
    await stream.open('b', 2);
    await stream.open('a', 3);
    expect(stream.closed).toStrictEqual([1]);
    expect(stream.live()).toStrictEqual([2, 3]);
    expect(logs.events()).toContain('camera.session_replaced');
  });

  it('forgets viewers that went away, so a reused consumer id is never closed for the wrong client', async () => {
    const stream = fakeStream();
    await stream.open('a', 5);
    stream.end(5);
    await stream.open('b', 5);
    await stream.open('a', 6);
    expect(stream.closed).toStrictEqual([]);
    expect(stream.live()).toStrictEqual([5, 6]);
  });
});
