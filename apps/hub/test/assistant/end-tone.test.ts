import { describe, expect, it } from 'vitest';
import { TALK_FRAME_MS } from '@smarteverything/domain';
import { opusCodec } from '../../src/assistant-voice/audio';
import type { Cancel } from '../../src/clock';
import { hostLine } from '../../src/reach/hosted-call';
import { FEED_TAIL_MS } from '../../src/reach/announcing';
import { endTonePackets } from '../../src/reach/end-tone';
import { Logger } from '@smarteverything/logging';
import type { HostedCallRequest } from '../../src/assistant-voice/outreach';

function loudest(packet: Uint8Array): number {
  const codec = opusCodec();
  const pcm = codec.decode(packet);
  codec.free();
  return pcm.reduce((peak, sample) => Math.max(peak, Math.abs(sample)), 0);
}

describe('end tone', () => {
  it('is a short, soft falling two-note earcon', () => {
    const packets = endTonePackets();
    expect(packets.length * TALK_FRAME_MS).toBeLessThanOrEqual(400);
    expect(packets.length).toBeGreaterThanOrEqual(6);
    const peak = Math.max(...packets.map(loudest));
    expect(peak).toBeGreaterThan(1000);
    expect(peak).toBeLessThan(8000);
  });

  it('plays on a hosted line when the call ends, then releases the speaker', async () => {
    let time = 0;
    const timers: { at: number; run: () => void }[] = [];
    const clock = {
      now: (): Date => new Date(time),
      at: (moment: Date, run: () => void): Cancel => {
        const timer = { at: moment.getTime(), run };
        timers.push(timer);
        return (): void => {
          timers.splice(timers.indexOf(timer), 1);
        };
      },
    };
    const advance = (ms: number): void => {
      const end = time + ms;
      for (
        let next = timers.sort((a, b) => a.at - b.at)[0];
        next !== undefined && next.at <= end;
        next = timers.sort((a, b) => a.at - b.at)[0]
      ) {
        timers.splice(timers.indexOf(next), 1);
        time = next.at;
        next.run();
      }
      time = end;
    };
    const played: Uint8Array[] = [];
    let closed = false;
    const requests: HostedCallRequest[] = [];
    await hostLine(
      {
        host: (hosted) => {
          requests.push(hosted);
          return Promise.resolve({ hear: () => undefined, end: () => Promise.resolve() });
        },
        clock,
        log: new Logger('hub.test'),
      },
      {
        key: 'camera:test',
        caller: { profileId: 'p', role: 'owner', label: 'Test camera' },
        opening: { chatId: 'c', text: 'hello', outreachId: 'o' },
        play: (packet) => played.push(packet),
        closed: () => {
          closed = true;
        },
      },
    );
    requests[0]?.endpoint.send({ type: 'ended', callId: 'o', reason: 'idle', detail: null });
    advance(1000);
    expect(played).toEqual([...endTonePackets()]);
    expect(closed).toBe(false);
    advance(FEED_TAIL_MS);
    expect(closed).toBe(true);
  });
});
