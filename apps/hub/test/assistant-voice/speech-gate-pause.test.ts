import type { Model } from '@ricky0123/vad-web/dist/models/common.js';
import { describe, expect, it } from 'vitest';
import { AUTOMATIC_HANGOVER_MS } from '@smarteverything/domain';
import { SpeechGate } from '../../src/assistant-voice/speech-gate';

const FRAME = 512;
const SPEECH_FRAMES = 12;

function model(heard: { speech: boolean }): Model {
  return {
    process: () =>
      Promise.resolve({ isSpeech: heard.speech ? 0.95 : 0, notSpeech: heard.speech ? 0.05 : 1 }),
    reset_state: (): void => undefined,
    release: () => Promise.resolve(),
  };
}

function loud(): Int16Array {
  return new Int16Array(FRAME).fill(8000);
}

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

interface Run {
  readonly ended: () => number;
  readonly speak: () => Promise<void>;
  readonly silence: (frames: number) => Promise<void>;
  readonly gate: SpeechGate;
}

function run(pauseMs: number | undefined): Run {
  const heard = { speech: true };
  let ended = 0;
  const gate = new SpeechGate(
    model(heard),
    {
      start: (): void => undefined,
      audio: (): void => undefined,
      end: (): void => {
        ended += 1;
      },
      failed: (reason): void => {
        throw new Error(reason);
      },
    },
    {
      bargeInLevel: 0,
      assistantAudible: (): boolean => false,
      now: (): number => 0,
      ...(pauseMs === undefined ? {} : { pauseMs }),
    },
  );
  return {
    gate,
    ended: (): number => ended,
    speak: async (): Promise<void> => {
      heard.speech = true;
      for (let index = 0; index < SPEECH_FRAMES; index += 1) gate.hear(loud());
      await settle();
    },
    silence: async (frames: number): Promise<void> => {
      heard.speech = false;
      for (let index = 0; index < frames; index += 1) gate.hear(loud());
      await settle();
    },
  };
}

describe('the speech gate end-of-speech pause', () => {
  it('ends the sentence after the short pause but not before it', async () => {
    const gate = run(200);
    await gate.speak();
    await gate.silence(3);
    expect(gate.ended()).toBe(0);
    await gate.silence(4);
    expect(gate.ended()).toBe(1);
  });

  it('waits through a short break when the pause is long', async () => {
    const gate = run(1000);
    await gate.speak();
    await gate.silence(12);
    expect(gate.ended()).toBe(0);
    await gate.silence(24);
    expect(gate.ended()).toBe(1);
  });

  it.each([undefined, 0])(
    'keeps a sentence with a 350 ms break in one turn in Automatic (%s)',
    async (automatic) => {
      const gate = run(automatic);
      await gate.speak();
      await gate.silence(11);
      await gate.speak();
      await gate.silence(11);
      expect(gate.ended()).toBe(0);
    },
  );

  it('lets go of the stream a fixed hangover after speech in Automatic', async () => {
    const gate = run(0);
    await gate.speak();
    await gate.silence(Math.floor(AUTOMATIC_HANGOVER_MS / 32) - 4);
    expect(gate.ended()).toBe(0);
    await gate.silence(8);
    expect(gate.ended()).toBe(1);
  });

  it('keeps a sentence with a 350 ms break in one turn at every explicit pause above it', async () => {
    for (const pauseMs of [640, 1000, 2500]) {
      const gate = run(pauseMs);
      await gate.speak();
      await gate.silence(11);
      await gate.speak();
      await gate.silence(11);
      expect(gate.ended()).toBe(0);
    }
  });

  it('follows a switch to Automatic while it listens', async () => {
    const gate = run(2500);
    gate.gate.pause(0);
    await gate.speak();
    await gate.silence(Math.ceil(AUTOMATIC_HANGOVER_MS / 32) + 4);
    expect(gate.ended()).toBe(1);
  });

  it('follows a pause changed while it listens', async () => {
    const gate = run(200);
    gate.gate.pause(1000);
    await gate.speak();
    await gate.silence(12);
    expect(gate.ended()).toBe(0);
    await gate.silence(24);
    expect(gate.ended()).toBe(1);
  });
});
