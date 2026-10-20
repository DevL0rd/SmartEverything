import type { Model } from '@ricky0123/vad-web/dist/models/common.js';
import { describe, expect, it, vi } from 'vitest';
import { MicMeter } from '../../src/assistant-voice/mic-meter';
import {
  speechInput,
  type SpeechInput,
  type SpeechPause,
} from '../../src/assistant-voice/speech-input';

const FRAME = 512;
const heard = { speech: true };

vi.mock('../../src/assistant-voice/silero-vad', () => ({
  sileroModel: (): Promise<Model> =>
    Promise.resolve({
      process: () =>
        Promise.resolve({ isSpeech: heard.speech ? 0.95 : 0, notSpeech: heard.speech ? 0.05 : 1 }),
      reset_state: (): void => undefined,
      release: () => Promise.resolve(),
    }),
}));

async function frames(input: SpeechInput, count: number, speech: boolean): Promise<void> {
  heard.speech = speech;
  for (let index = 0; index < count; index += 1) input.hear(new Int16Array(FRAME).fill(8000));
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}

interface Pause extends SpeechPause {
  readonly change: (ms: 0 | 200 | 1000) => void;
  readonly listeners: () => number;
}

function pauseOf(first: 0 | 200 | 1000): Pause {
  const listeners = new Set<(ms: 0 | 200 | 1000) => void>();
  let current = first;
  return {
    ms: (): 0 | 200 | 1000 => current,
    onChange: (listener) => {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },
    change: (ms): void => {
      current = ms;
      listeners.forEach((listener) => {
        listener(ms);
      });
    },
    listeners: () => listeners.size,
  };
}

async function detected(
  pause: Pause,
): Promise<{ readonly input: SpeechInput; readonly ended: () => number }> {
  let ended = 0;
  const input = await speechInput(
    'echo-cancelled',
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
      pause,
      assistantAudible: () => false,
      now: () => 0,
      meter: new MicMeter(
        () => 0,
        (): void => undefined,
      ),
      voice: (): void => undefined,
    },
  );
  return { input, ended: (): number => ended };
}

describe('the hub call gate end-of-speech pause', () => {
  it('ends a sentence after the short home pause', async () => {
    const { input, ended } = await detected(pauseOf(200));
    await frames(input, 12, true);
    await frames(input, 3, false);
    expect(ended()).toBe(0);
    await frames(input, 4, false);
    expect(ended()).toBe(1);
  });

  it('leaves the turn to Gemini in Automatic, keeping a 350 ms break inside one sentence', async () => {
    const { input, ended } = await detected(pauseOf(0));
    await frames(input, 12, true);
    await frames(input, 11, false);
    await frames(input, 12, true);
    await frames(input, 11, false);
    expect(ended()).toBe(0);
    await frames(input, 24, false);
    expect(ended()).toBe(1);
  });

  it('waits through a break when the home pause is long', async () => {
    const { input, ended } = await detected(pauseOf(1000));
    await frames(input, 12, true);
    await frames(input, 12, false);
    expect(ended()).toBe(0);
    await frames(input, 24, false);
    expect(ended()).toBe(1);
  });

  it('retunes a running call and stops following when released', async () => {
    const pause = pauseOf(200);
    const { input, ended } = await detected(pause);
    pause.change(1000);
    await frames(input, 12, true);
    await frames(input, 12, false);
    expect(ended()).toBe(0);
    expect(pause.listeners()).toBe(1);
    await input.release();
    expect(pause.listeners()).toBe(0);
  });
});
