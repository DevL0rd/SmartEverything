import { beforeEach, describe, expect, it } from 'vitest';
import { CameraSpeakers } from '../../src/talk/camera-speaker';
import type { OggFeed } from '../../src/talk/feeds';
import { isSilence } from '../../src/talk/speaker-mix';
import { KEEPALIVE_MS, SOURCE_QUIET_MS } from '../../src/talk/speaker-output';
import { OPUS_SILENCE } from '../../src/reach/voice-pacing';
import type { PacketSink } from '../../src/talk/transmission';
import { FakeClock } from '../support/fake-clock';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';

const START = '2026-10-18T00:00:00.000Z';

interface FakeFeed {
  readonly url: string;
  readonly packets: Uint8Array[];
  readonly left: () => void;
  ended: boolean;
}

interface Rig {
  readonly clock: FakeClock;
  readonly speakers: CameraSpeakers;
  readonly feeds: FakeFeed[];
  readonly played: string[];
  readonly settle: () => Promise<void>;
  readonly advance: (ms: number) => Promise<void>;
  failing: boolean;
}

function rig(): Rig {
  const clock = new FakeClock(START);
  const feeds: FakeFeed[] = [];
  const played: string[] = [];
  const settle = async (): Promise<void> => {
    for (let round = 0; round < 5; round += 1) {
      await Promise.resolve();
    }
  };
  const state: Rig = {
    clock,
    feeds,
    played,
    settle,
    failing: false,
    advance: async (ms: number): Promise<void> => {
      clock.advanceTo(new Date(clock.now().getTime() + ms).toISOString());
      await settle();
    },
    speakers: new CameraSpeakers({
      go2rtc: {
        play: (cameraId, source): Promise<void> => {
          played.push(`${cameraId} ${source.replace(/#.*$/, '')}`);
          return state.failing ? Promise.reject(new Error('refused')) : Promise.resolve();
        },
      },
      feeds: {
        open: (left: () => void): OggFeed => {
          const feed: FakeFeed = {
            url: `feed-${String(feeds.length)}`,
            packets: [],
            left,
            ended: false,
          };
          feeds.push(feed);
          return {
            url: feed.url,
            packet: (packet): void => {
              feed.packets.push(packet);
            },
            end: (): void => {
              feed.ended = true;
            },
          };
        },
      },
      ready: (): Promise<void> => Promise.resolve(),
      clock,
      log: testLogger('speaker'),
    }),
  };
  return state;
}

function say(sink: PacketSink, packet: Uint8Array): () => void {
  return (): void => {
    sink.packet(packet);
  };
}

const VOICE_A = Uint8Array.of(0xfc, 0xaa);
const VOICE_P = Uint8Array.of(0xfc, 0xbb);

function voiced(feed: FakeFeed | undefined): number[] {
  return (feed?.packets ?? [])
    .filter((packet) => !isSilence(packet))
    .map((packet) => packet[1] ?? 0);
}

async function frames(test: Rig, sends: readonly (() => void)[], count: number): Promise<void> {
  for (let frame = 0; frame < count; frame += 1) {
    sends.forEach((send) => {
      send();
    });
    await test.advance(20);
  }
}

let logs: CapturedLogs;
let test: Rig;

beforeEach(() => {
  logs = captureLogs();
  test = rig();
});

function fields(event: string): Record<string, unknown>[] {
  return logs.records
    .filter((record) => record.event === event)
    .map((record) => ({ ...record.payload }));
}

describe('camera speaker standby', () => {
  it('opens one output, primes it and keeps it alive with sparse silence past a minute', async () => {
    const release = test.speakers.standby('cam-1');
    await test.settle();
    expect(test.played).toEqual(['cam-1 ffmpeg:feed-0']);
    const primed = test.feeds[0]?.packets.length ?? 0;
    await test.advance(70_000);
    const sent = (test.feeds[0]?.packets.length ?? 0) - primed;
    expect(sent).toBeGreaterThanOrEqual(Math.floor(70_000 / KEEPALIVE_MS) - 1);
    expect(sent).toBeLessThanOrEqual(Math.ceil(70_000 / KEEPALIVE_MS) + 1);
    expect(test.feeds[0]?.packets.every(isSilence)).toBe(true);
    expect(test.played).toHaveLength(1);
    release();
    expect(test.feeds[0]?.ended).toBe(true);
  });

  it('lets a call adopt the open output at once and falls back to the keepalive when it ends', async () => {
    test.speakers.standby('cam-1');
    await test.advance(30_000);
    const call = test.speakers.open('cam-1', 'call-1', 'assistant');
    await frames(test, [say(call, VOICE_A)], 10);
    call.end();
    expect(test.played).toHaveLength(1);
    expect(voiced(test.feeds[0])).toEqual(Array.from({ length: 10 }, () => 0xaa));
    expect(fields('talk.camera_speaker_played')[0]).toMatchObject({
      owner: 'assistant',
      waitMs: 0,
      playedMs: 200,
    });
    const before = test.feeds[0]?.packets.length ?? 0;
    await test.advance(KEEPALIVE_MS * 2);
    expect((test.feeds[0]?.packets.length ?? 0) - before).toBeGreaterThanOrEqual(1);
    expect(test.feeds[0]?.ended).toBe(false);
  });

  it('reconnects with a fresh feed when go2rtc drops the output and keeps standing by', async () => {
    test.speakers.standby('cam-1');
    await test.settle();
    test.feeds[0]?.left();
    await test.settle();
    expect(test.played).toEqual(['cam-1 ffmpeg:feed-0', 'cam-1 ffmpeg:feed-1']);
    expect(test.feeds[0]?.ended).toBe(true);
    await test.advance(KEEPALIVE_MS + 20);
    expect(test.feeds[1]?.packets.length).toBeGreaterThan(0);
  });

  it('retries a refused output after a pause instead of giving up', async () => {
    test.failing = true;
    test.speakers.standby('cam-1');
    await test.settle();
    expect(test.played).toHaveLength(2);
    test.failing = false;
    await test.advance(1000);
    expect(test.played).toHaveLength(3);
    expect(fields('talk.camera_speaker_started')).toHaveLength(1);
  });
});

describe('sharing one camera speaker', () => {
  it('gives a person talking over the assistant the speaker and hands it back after', async () => {
    const assistant = test.speakers.open('cam-1', 'call-1', 'assistant');
    await test.settle();
    await frames(test, [say(assistant, VOICE_A)], 3);
    const person = test.speakers.open('cam-1', 'msg-1', 'talk');
    await frames(test, [say(assistant, VOICE_A), say(person, VOICE_P)], 5);
    person.end();
    await frames(test, [say(assistant, VOICE_A)], 2);
    expect(voiced(test.feeds[0])).toEqual([
      0xaa, 0xaa, 0xaa, 0xaa, 0xbb, 0xbb, 0xbb, 0xbb, 0xbb, 0xaa, 0xaa,
    ]);
    expect(test.played).toHaveLength(1);
    expect(fields('talk.camera_speaker_played')[0]).toMatchObject({
      owner: 'talk',
      priority: 3,
      playedMs: 100,
    });
  });

  it('plays a walkie message on an idle camera straight away', async () => {
    test.speakers.standby('cam-1');
    await test.advance(10_000);
    const walkie = test.speakers.open('cam-1', 'msg-1', 'talk');
    await frames(test, [say(walkie, VOICE_P)], 4);
    walkie.end();
    expect(voiced(test.feeds[0])).toEqual([0xbb, 0xbb, 0xbb, 0xbb]);
  });

  it('lets a walkie message through the silence between the assistant’s words', async () => {
    const assistant = test.speakers.open('cam-1', 'call-1', 'assistant');
    await test.settle();
    const walkie = test.speakers.open('cam-1', 'msg-1', 'talk');
    await frames(test, [say(assistant, OPUS_SILENCE), say(walkie, VOICE_P)], 3);
    const feed = test.feeds[0]?.packets ?? [];
    expect(voiced(test.feeds[0])).toEqual([0xbb, 0xbb, 0xbb]);
    expect(feed.slice(-3).every((packet) => !isSilence(packet))).toBe(true);
  });

  it('holds one-off speech while the assistant speaks and plays it in the pauses', async () => {
    const assistant = test.speakers.open('cam-1', 'call-1', 'assistant');
    await test.settle();
    const speech = test.speakers.open('cam-1', 'say-1', 'speech');
    await frames(test, [say(assistant, VOICE_A), say(speech, VOICE_P)], 2);
    await frames(test, [say(assistant, OPUS_SILENCE), say(speech, VOICE_P)], 2);
    expect(voiced(test.feeds[0])).toEqual([0xaa, 0xaa, 0xbb, 0xbb]);
  });

  it('keeps two cameras independent', async () => {
    const one = test.speakers.open('cam-1', 'call-1', 'assistant');
    const two = test.speakers.open('cam-2', 'msg-1', 'talk');
    await test.settle();
    await frames(test, [say(one, VOICE_A), say(two, VOICE_P)], 2);
    expect(test.played).toEqual(['cam-1 ffmpeg:feed-0', 'cam-2 ffmpeg:feed-1']);
    expect(voiced(test.feeds[0])).toEqual([0xaa, 0xaa]);
    expect(voiced(test.feeds[1])).toEqual([0xbb, 0xbb]);
  });

  it('closes an on-demand output when its last source ends and opens it again for the next', async () => {
    const one = test.speakers.open('cam-1', 'call-1', 'assistant');
    await test.settle();
    one.end();
    one.end();
    expect(test.feeds[0]?.ended).toBe(true);
    test.speakers.open('cam-1', 'call-2', 'assistant');
    await test.settle();
    expect(test.played).toEqual(['cam-1 ffmpeg:feed-0', 'cam-1 ffmpeg:feed-1']);
  });

  it('never lets a hung source hold the speaker', async () => {
    const hung = test.speakers.open('cam-1', 'stuck', 'talk');
    await test.settle();
    hung.packet(VOICE_P);
    const assistant = test.speakers.open('cam-1', 'call-1', 'assistant');
    await test.advance(400);
    await frames(test, [say(assistant, VOICE_A)], 2);
    expect(voiced(test.feeds[0])).toEqual([0xbb, 0xaa, 0xaa]);
    assistant.end();
    await test.advance(SOURCE_QUIET_MS + KEEPALIVE_MS);
    expect(fields('talk.camera_speaker_played').at(-1)).toMatchObject({
      sourceId: 'stuck',
      ending: 'expired',
    });
    expect(test.feeds[0]?.ended).toBe(true);
  });
});
