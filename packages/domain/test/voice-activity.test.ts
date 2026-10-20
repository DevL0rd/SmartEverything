import { describe, expect, it } from 'vitest';
import {
  AUTOMATIC_HANGOVER_MS,
  AUTOMATIC_PAUSE_MS,
  BARGE_IN,
  BARGE_IN_LEVEL,
  DEFAULT_PAUSE_MS,
  PAUSE_CHOICES_MS,
  Preroll,
  TalkGate,
  levelOf,
  redemptionOf,
  speechDetectionOf,
} from '../src';

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

describe('the default turn taking', () => {
  function defaultGate(): { readonly talk: TalkGate; readonly log: string[] } {
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
      BARGE_IN_LEVEL.echoCancelled,
    );
    return { talk, log };
  }

  it('defaults to Automatic, which waits longer than a natural pause before the gate lets go', () => {
    expect(PAUSE_CHOICES_MS).toContain(DEFAULT_PAUSE_MS);
    expect(DEFAULT_PAUSE_MS).toBe(AUTOMATIC_PAUSE_MS);
    expect(redemptionOf(DEFAULT_PAUSE_MS)).toBeGreaterThan(350);
    expect(speechDetectionOf('more', AUTOMATIC_PAUSE_MS).redemptionMs).toBe(AUTOMATIC_HANGOVER_MS);
  });

  it('keeps every explicit pause as the gate pause', () => {
    for (const choice of PAUSE_CHOICES_MS.filter((ms) => ms !== AUTOMATIC_PAUSE_MS)) {
      expect(redemptionOf(choice)).toBe(choice);
    }
  });

  it('lets a soft voice barge in over the assistant after the default sustain time', () => {
    const { talk, log } = defaultGate();
    frames(talk, 0, 1, { assistantAudible: true, level: 0.01 });
    talk.speechConfirmed();
    frames(talk, 32, Math.ceil(BARGE_IN.sustainMs / 32), { assistantAudible: true, level: 0.035 });
    expect(log).toEqual(['open']);
  });

  it('keeps the residual echo of the assistant out at the default barge in level', () => {
    const { talk, log } = defaultGate();
    frames(talk, 0, 1, { assistantAudible: true, level: 0.01 });
    talk.speechConfirmed();
    frames(talk, 32, 60, { assistantAudible: true, level: 0.025 });
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
