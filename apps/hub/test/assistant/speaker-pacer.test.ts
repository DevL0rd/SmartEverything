import { describe, expect, it } from 'vitest';
import { opusCodec } from '../../src/assistant-voice/audio';
import type { Cancel } from '../../src/clock';
import { OPUS_SILENCE, SpeakerPacer } from '../../src/reach/voice-pacing';

interface FakeClock {
  readonly now: () => Date;
  readonly at: (moment: Date, action: () => void) => Cancel;
  readonly advance: (ms: number) => void;
}

function fakeClock(): FakeClock {
  let time = 0;
  const due: { at: number; action: () => void }[] = [];
  return {
    now: (): Date => new Date(time),
    at: (moment, action): Cancel => {
      const entry = { at: moment.getTime(), action };
      due.push(entry);
      return (): void => {
        due.splice(due.indexOf(entry), 1);
      };
    },
    advance: (ms): void => {
      const end = time + ms;
      for (
        let next = due.sort((a, b) => a.at - b.at)[0];
        next !== undefined && next.at <= end;
        next = due.sort((a, b) => a.at - b.at)[0]
      ) {
        due.splice(due.indexOf(next), 1);
        time = next.at;
        next.action();
      }
      time = end;
    },
  };
}

const speech = Uint8Array.of(1, 2, 3);

describe('SpeakerPacer on a camera', () => {
  it('keeps the speaker fed with silence through a tool-call gap, so the reply plays in step', () => {
    const clock = fakeClock();
    const played: string[] = [];
    const turns: number[] = [];
    const pacer = new SpeakerPacer(
      clock,
      (packet) => {
        played.push(packet === OPUS_SILENCE ? 'silence' : 'speech');
      },
      {
        idle: OPUS_SILENCE,
        spoke: (frames): void => {
          turns.push(frames);
        },
      },
    );
    pacer.push(speech);
    pacer.push(speech);
    clock.advance(12_000);
    pacer.push(speech);
    clock.advance(100);
    pacer.stop();
    expect(played.filter((kind) => kind === 'silence').length).toBeGreaterThanOrEqual(595);
    expect(played.filter((kind) => kind === 'speech')).toHaveLength(3);
    expect(turns).toEqual([2, 1]);
  });

  it('stops sending anything once stopped', () => {
    const clock = fakeClock();
    let count = 0;
    const pacer = new SpeakerPacer(clock, () => (count += 1), {
      idle: OPUS_SILENCE,
      spoke: (): void => undefined,
    });
    clock.advance(100);
    pacer.stop();
    const before = count;
    clock.advance(1000);
    expect(count).toBe(before);
  });

  it('still reports drained after the last real frame for one-off speech', () => {
    const clock = fakeClock();
    let drained = false;
    const pacer = new SpeakerPacer(clock, () => undefined);
    pacer.push(speech);
    pacer.whenDrained(() => {
      drained = true;
    });
    expect(drained).toBe(false);
    clock.advance(40);
    expect(drained).toBe(true);
  });

  it('uses a valid 20 ms Opus silence frame', () => {
    const codec = opusCodec();
    const pcm = codec.decode(OPUS_SILENCE);
    codec.free();
    expect(pcm.length).toBe(960);
    expect(pcm.every((sample) => sample === 0)).toBe(true);
  });
});
