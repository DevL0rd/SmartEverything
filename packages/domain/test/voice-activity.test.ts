import { describe, expect, it } from 'vitest';
import { BARGE_IN, Preroll, TalkGate, levelOf } from '../src';

const LEVEL = 0.04;

function gate(): { readonly talk: TalkGate; readonly log: string[] } {
  const log: string[] = [];
  const talk = new TalkGate(
    {
      open: (): void => {
        log.push('open');
      },
      close: (): void => {
        log.push('close');
      },
    },
    LEVEL,
  );
  return { talk, log };
}

function frames(
  talk: TalkGate,
  from: number,
  count: number,
  frame: Partial<Parameters<TalkGate['frame']>[0]>,
): void {
  for (let index = 0; index < count; index++) {
    talk.frame({
      probability: 0.9,
      level: 0.1,
      durationMs: 32,
      assistantAudible: false,
      at: from + index * 32,
      ...frame,
    });
  }
}

describe('TalkGate', () => {
  it('opens on confirmed speech while the AI is quiet and closes when speech ends', () => {
    const { talk, log } = gate();
    frames(talk, 0, 5, {});
    talk.speechConfirmed();
    talk.speechEnded();
    expect(log).toEqual(['open', 'close']);
  });

  it('stays shut for echo while the AI is audible and for its tail', () => {
    const { talk, log } = gate();
    frames(talk, 0, 20, { assistantAudible: true, level: 0.02 });
    talk.speechConfirmed();
    frames(talk, 640, BARGE_IN.echoTailMs / 32 + 4, { level: 0.02 });
    talk.speechEnded();
    expect(log).toEqual([]);
  });

  it('lets confident, loud speech barge in after the sustain time', () => {
    const { talk, log } = gate();
    frames(talk, 0, 1, { assistantAudible: true, level: 0.01 });
    talk.speechConfirmed();
    frames(talk, 32, Math.ceil(BARGE_IN.sustainMs / 32) - 1, { assistantAudible: true });
    expect(log).toEqual([]);
    frames(talk, 400, 1, { assistantAudible: true });
    expect(log).toEqual(['open']);
  });

  it('does not barge in on quiet or unsure speech', () => {
    const { talk, log } = gate();
    frames(talk, 0, 1, { assistantAudible: true, level: 0.01 });
    talk.speechConfirmed();
    frames(talk, 32, 20, { assistantAudible: true, level: 0.01 });
    frames(talk, 700, 20, { assistantAudible: true, probability: 0.6 });
    expect(log).toEqual([]);
  });
});

describe('Preroll', () => {
  it('keeps at least the requested time and releases it once', () => {
    const preroll = new Preroll<number>(60);
    [1, 2, 3, 4, 5].forEach((item) => {
      preroll.push(item, 20);
    });
    expect(preroll.take()).toEqual([3, 4, 5]);
    expect(preroll.take()).toEqual([]);
  });
});

describe('levelOf', () => {
  it('is the RMS as a share of full scale', () => {
    expect(levelOf(new Int16Array([16384, -16384]), 32768)).toBeCloseTo(0.5);
    expect(levelOf(new Float32Array(0), 1)).toBe(0);
  });
});
