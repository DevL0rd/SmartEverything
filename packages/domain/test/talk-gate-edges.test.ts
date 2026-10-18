import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BARGE_IN, ECHO_POLICY, Preroll, TalkGate, type EchoPolicy } from '../src';

const FRAME_MS = 32;
const BARGE_LEVEL = 0.5;

function gateWith(
  policy: EchoPolicy,
  bargeInLevel = BARGE_LEVEL,
): { readonly talk: TalkGate; readonly log: string[] } {
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
    bargeInLevel,
    policy,
  );
  return { talk, log };
}

function hear(
  talk: TalkGate,
  at: number,
  heard: { readonly probability?: number; readonly level?: number; readonly audible?: boolean },
  durationMs = FRAME_MS,
): void {
  talk.frame({
    probability: heard.probability ?? 0.9,
    level: heard.level ?? 1,
    durationMs,
    assistantAudible: heard.audible ?? true,
    at,
  });
}

function overAudibleAssistant(policy: EchoPolicy): ReturnType<typeof gateWith> {
  const gate = gateWith(policy);
  hear(gate.talk, 0, { level: 0, probability: 0 });
  gate.talk.speechConfirmed();
  return gate;
}

function loudFrames(talk: TalkGate, count: number, heard: Parameters<typeof hear>[2] = {}): void {
  for (let index = 1; index <= count; index++) {
    hear(talk, index * FRAME_MS, heard);
  }
}

const SUSTAIN_FRAMES = Math.ceil(BARGE_IN.sustainMs / FRAME_MS);

describe('TalkGate barge-in thresholds', () => {
  it('counts a frame exactly at the confidence threshold as confident', () => {
    const { talk, log } = overAudibleAssistant(ECHO_POLICY.normal);
    loudFrames(talk, SUSTAIN_FRAMES, { probability: BARGE_IN.probability });
    expect(log).toEqual(['open']);
  });

  it('refuses a frame just under the confidence threshold', () => {
    const { talk, log } = overAudibleAssistant(ECHO_POLICY.normal);
    loudFrames(talk, SUSTAIN_FRAMES * 4, { probability: BARGE_IN.probability - 0.001 });
    expect(log).toEqual([]);
  });

  it('counts a frame exactly at the required level as loud enough', () => {
    const { talk, log } = overAudibleAssistant(ECHO_POLICY.normal);
    loudFrames(talk, SUSTAIN_FRAMES, { level: BARGE_LEVEL });
    expect(log).toEqual(['open']);
  });

  it('multiplies the required level by the policy scale instead of dividing it', () => {
    const strong = ECHO_POLICY.strong;
    const frames = Math.ceil(strong.sustainMs / FRAME_MS);
    const needed = BARGE_LEVEL * strong.bargeInLevelScale;

    const enough = overAudibleAssistant(strong);
    loudFrames(enough.talk, frames, { level: needed });
    expect(enough.log).toEqual(['open']);

    const base = overAudibleAssistant(strong);
    loudFrames(base.talk, frames * 4, { level: BARGE_LEVEL });
    expect(base.log).toEqual([]);

    const under = overAudibleAssistant(strong);
    loudFrames(under.talk, frames * 4, { level: needed - 0.001 });
    expect(under.log).toEqual([]);
  });

  it('opens after exactly the sustain time of consecutive confident frames, for any frame size and sustain', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 64 }),
        fc.integer({ min: 1, max: 2000 }),
        (frameMs, sustainMs) => {
          const { talk, log } = gateWith({ ...ECHO_POLICY.normal, sustainMs });
          hear(talk, 0, { level: 0, probability: 0 }, frameMs);
          talk.speechConfirmed();
          const frames = Math.ceil(sustainMs / frameMs);
          for (let index = 1; index < frames; index++) {
            hear(talk, index * frameMs, {}, frameMs);
          }
          const before = [...log];
          hear(talk, frames * frameMs, {}, frameMs);
          expect(before).toEqual([]);
          expect(log).toEqual(['open']);
        },
      ),
    );
  });

  it('restarts the sustain count after a frame that is not confident', () => {
    const { talk, log } = overAudibleAssistant(ECHO_POLICY.normal);
    loudFrames(talk, SUSTAIN_FRAMES - 1);
    hear(talk, 900, { probability: 0 });
    loudFrames(talk, SUSTAIN_FRAMES - 1);
    expect(log).toEqual([]);
  });

  it('never lets speech through over the assistant when interrupting is off', () => {
    const { talk, log } = overAudibleAssistant(ECHO_POLICY.no_interrupt);
    loudFrames(talk, 200);
    expect(log).toEqual([]);
  });
});

describe('TalkGate echo tail', () => {
  const tail = ECHO_POLICY.normal.echoTailMs;

  it('is still inside the tail exactly one tail after the assistant was last audible', () => {
    const { talk, log } = gateWith(ECHO_POLICY.normal);
    hear(talk, 0, { level: 0, probability: 0 });
    hear(talk, tail, { level: 0, probability: 0, audible: false });
    talk.speechConfirmed();
    expect(log).toEqual([]);
  });

  it('is past the tail one millisecond later', () => {
    const { talk, log } = gateWith(ECHO_POLICY.normal);
    hear(talk, 0, { level: 0, probability: 0 });
    hear(talk, tail + 1, { level: 0, probability: 0, audible: false });
    talk.speechConfirmed();
    expect(log).toEqual(['open']);
  });

  it('does not forget that speech began over the assistant after the tail has passed', () => {
    const { talk, log } = gateWith(ECHO_POLICY.normal);
    hear(talk, 0, { level: 0, probability: 0 });
    hear(talk, tail, { level: 0, probability: 0, audible: false });
    talk.speechConfirmed();
    hear(talk, tail + 100, { level: 0, probability: 0, audible: false });
    expect(log).toEqual([]);
  });

  it('starts a new utterance clear of the echo of the last one', () => {
    const { talk, log } = overAudibleAssistant(ECHO_POLICY.normal);
    talk.speechEnded();
    hear(talk, 5000, { level: 0, probability: 0, audible: false });
    talk.speechConfirmed();
    expect(log).toEqual(['open']);
  });
});

describe('TalkGate state', () => {
  it('stays shut until speech is confirmed, however loud the room is', () => {
    const { talk, log } = gateWith(ECHO_POLICY.headphones);
    loudFrames(talk, 100, { audible: false });
    expect(log).toEqual([]);
    expect(talk.open).toBe(false);
  });

  it('reports whether it is open', () => {
    const { talk } = gateWith(ECHO_POLICY.headphones);
    expect(talk.open).toBe(false);
    hear(talk, 0, { audible: false });
    talk.speechConfirmed();
    expect(talk.open).toBe(true);
    talk.speechEnded();
    expect(talk.open).toBe(false);
  });

  it('applies a new policy at once to speech that is waiting out the echo', () => {
    const { talk, log } = overAudibleAssistant(ECHO_POLICY.normal);
    expect(log).toEqual([]);
    talk.setPolicy(ECHO_POLICY.headphones);
    expect(log).toEqual(['open']);
  });

  it('holds speech back under a new policy that refuses it', () => {
    const { talk, log } = overAudibleAssistant(ECHO_POLICY.headphones);
    expect(log).toEqual(['open']);
    talk.speechEnded();
    talk.setPolicy(ECHO_POLICY.no_interrupt);
    hear(talk, 100, {});
    talk.speechConfirmed();
    loudFrames(talk, 100);
    expect(log).toEqual(['open', 'close']);
  });

  it('ignores the assistant being audible when the policy says to', () => {
    const { talk, log } = gateWith(ECHO_POLICY.headphones);
    hear(talk, 0, { level: 0, probability: 0, audible: true });
    talk.speechConfirmed();
    expect(log).toEqual(['open']);
  });
});

describe('Preroll edges', () => {
  it('shows what it holds without releasing it', () => {
    const preroll = new Preroll<string>(100);
    preroll.push('a', 20);
    preroll.push('b', 20);
    expect(preroll.peek()).toEqual(['a', 'b']);
    expect(preroll.peek()).toEqual(['a', 'b']);
    expect(preroll.take()).toEqual(['a', 'b']);
    expect(preroll.peek()).toEqual([]);
  });

  it('keeps nothing when asked to keep no time', () => {
    const preroll = new Preroll<number>(0);
    preroll.push(1, 20);
    preroll.push(2, 20);
    expect(preroll.take()).toEqual([]);
  });

  it('holds the shortest recent run that covers the requested time', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 40 }),
        (keepMs, durations) => {
          const preroll = new Preroll<number>(keepMs);
          durations.forEach((ms, index) => {
            preroll.push(index, ms);
          });
          const kept = preroll.take();
          const firstKept = durations.length - kept.length;
          expect(kept).toEqual(durations.map((_, index) => index).slice(firstKept));
          const heldMs = durations.slice(firstKept).reduce((sum, ms) => sum + ms, 0);
          const total = durations.reduce((sum, ms) => sum + ms, 0);
          expect(heldMs).toBeGreaterThanOrEqual(Math.min(keepMs, total));
          const oldest = durations[firstKept];
          expect(oldest).toBeDefined();
          expect(heldMs - (oldest ?? 0)).toBeLessThan(keepMs);
        },
      ),
    );
  });
});
