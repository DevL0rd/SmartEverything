import { request, type ClientRequest } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { Logger } from '@smarteverything/logging';
import { systemClock } from '../../src/clock';
import { CameraSpeakers } from '../../src/talk/camera-speaker';
import { TalkFeeds } from '../../src/talk/feeds';
import { pause, until } from '../support/wait';

const feeds = new TalkFeeds(new Logger('hub.test'));

afterEach(() => {
  feeds.stop();
});

function urlOf(source: string): string {
  return source.replace(/^ffmpeg:/, '').replace(/#.*$/, '');
}

function read(url: string): { readonly request: ClientRequest; readonly bytes: () => number } {
  let total = 0;
  const pending = request(url, (response) => {
    response.on('data', (chunk: Buffer) => {
      total += chunk.length;
    });
  });
  pending.end();
  return { request: pending, bytes: () => total };
}

describe('camera speaker lifetime', () => {
  it('opens the camera output only for a call, carries its first words and closes it at the end', async () => {
    await feeds.start();
    const played: string[] = [];
    const speakers = new CameraSpeakers({
      go2rtc: {
        play: (_camera, source): Promise<void> => {
          played.push(urlOf(source));
          return Promise.resolve();
        },
      },
      feeds,
      ready: (): Promise<void> => Promise.resolve(),
      clock: systemClock,
      log: new Logger('hub.test'),
    });
    await pause(20);
    expect(played).toEqual([]);
    const sink = speakers.open('camera-1', 'call-1', 'assistant');
    for (let frame = 0; frame < 100; frame += 1) {
      sink.packet(Uint8Array.of(0xfc, 0x01, 0x02, 0x03));
    }
    await until(() => played.length === 1, 'the call output');
    const reader = read(played[0] ?? '');
    await until(() => reader.bytes() >= 100 * 4, 'the first words to reach the camera feed');
    sink.end();
    await pause(20);
    const next = speakers.open('camera-1', 'call-2', 'assistant');
    await until(() => played.length === 2, 'the next call output');
    next.end();
    reader.request.destroy();
  });
});

describe('camera speaker when go2rtc stops reading', () => {
  it('opens a fresh feed, plays it again and keeps the next turn', async () => {
    await feeds.start();
    const played: string[] = [];
    const speakers = new CameraSpeakers({
      go2rtc: {
        play: (_camera, source): Promise<void> => {
          played.push(urlOf(source));
          return Promise.resolve();
        },
      },
      feeds,
      ready: (): Promise<void> => Promise.resolve(),
      clock: systemClock,
      log: new Logger('hub.test'),
    });
    const sink = speakers.open('camera-1', 'session-1', 'assistant');
    await until(() => played.length === 1, 'the first feed');
    const first = read(played[0] ?? '');
    await until(() => first.bytes() > 0, 'the first feed to be read');
    first.request.destroy();
    await until(() => played.length === 2, 'the fresh feed');
    expect(played[1]).not.toBe(played[0]);
    sink.packet(Uint8Array.of(0xf8, 0xff, 0xfe));
    const second = read(played[1] ?? '');
    await until(() => second.bytes() > 0, 'the second feed to be read');
    sink.end();
    await pause(20);
    expect(played).toHaveLength(2);
  });
});
