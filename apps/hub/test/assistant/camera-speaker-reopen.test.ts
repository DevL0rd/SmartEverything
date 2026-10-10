import { request, type ClientRequest } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { Logger } from '@smarteverything/logging';
import { CameraSpeakers } from '../../src/talk/camera-speaker';
import { TalkFeeds } from '../../src/talk/feeds';

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

const settle = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
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
      log: new Logger('hub.test'),
    });
    const sink = speakers.open('camera-1', 'session-1', 'assistant');
    await settle(20);
    const first = read(played[0] ?? '');
    await settle(50);
    first.request.destroy();
    await settle(50);
    expect(played).toHaveLength(2);
    expect(played[1]).not.toBe(played[0]);
    sink?.packet(Uint8Array.of(0xf8, 0xff, 0xfe));
    const second = read(played[1] ?? '');
    await settle(50);
    expect(second.bytes()).toBeGreaterThan(0);
    sink?.end();
    await settle(20);
    expect(played).toHaveLength(2);
  });
});
