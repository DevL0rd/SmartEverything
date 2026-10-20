import { afterEach, describe, expect, it, vi } from 'vitest';
import { ASSISTANT_VOICE_SETTINGS, type AssistantVoiceSettings } from '@smarteverything/domain';
import type { CallLink } from '../../src/assistant-voice/call-link';
import { Conversation } from '../../src/assistant-voice/conversation';
import type { LiveSession, VoiceProvider } from '../../src/assistant-voice/gemini';
import { NO_REPLY_MS } from '../../src/assistant-voice/reply-watchdog';
import type { SpeechPause } from '../../src/assistant-voice/speech-input';
import { plainLine } from '../../src/assistant-voice/voice-line';

const link: CallLink = {
  audio: () => undefined,
  cut: () => undefined,
  playing: () => false,
  state: () => undefined,
  caption: () => undefined,
};

function pauseOf(ms: 0 | 640): SpeechPause {
  return { ms: () => ms, onChange: () => (): void => undefined };
}

async function cough(
  pauseMs: 0 | 640,
): Promise<{ readonly log: string[]; readonly stalls: string[]; readonly endings: string[] }> {
  vi.useFakeTimers();
  let clock = 0;
  const log: string[] = [];
  const stalls: string[] = [];
  const endings: string[] = [];
  const session: LiveSession = {
    audio: (): void => undefined,
    speaking: (speaking): void => {
      log.push(`speaking ${String(speaking)}`);
    },
    text: (text, respond): void => {
      log.push(`text ${text} respond=${String(respond)}`);
    },
    picture: (): void => undefined,
    toolResult: (): void => undefined,
    video: (): void => undefined,
    close: (): void => undefined,
  };
  const provider: VoiceProvider = { live: () => Promise.resolve(session) };
  const conversation = new Conversation(
    plainLine(provider),
    link,
    {
      speech: 'gated-client',
      pause: pauseOf(pauseMs),
      settings: (): AssistantVoiceSettings => ASSISTANT_VOICE_SETTINGS.parse({}),
      system: (): string => 'system',
      note: (): string => '',
      history: (): string[] => [],
      tools: (): [] => [],
      webSearch: (): boolean => false,
      window: (): null => null,
      record: (): void => undefined,
      task: (): string => 'event',
      run: (): Promise<never> => Promise.reject(new Error('no tools here')),
      ended: (reason): void => {
        endings.push(reason);
      },
      usage: (): void => undefined,
      measured: (): void => undefined,
      stalled: (step): void => {
        stalls.push(step);
      },
      staysOpenWhenQuiet: (): boolean => false,
    },
    () => clock,
  );
  await conversation.start(null);
  conversation.activity(true);
  conversation.hear(new Int16Array(320));
  conversation.activity(false);
  for (let wait = 0; wait < 2; wait += 1) {
    clock += NO_REPLY_MS + 200;
    await vi.advanceTimersByTimeAsync(NO_REPLY_MS + 200);
  }
  return { log, stalls, endings };
}

describe('a noise the gate opened for and Gemini ignored', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('makes the AI speak and then end the call when the gate decides the turn end', async () => {
    const { stalls } = await cough(640);
    expect(stalls).toEqual(['nudged', 'gave_up']);
  });

  it('leaves the call alone when Gemini decides the turn end', async () => {
    const { log, stalls, endings } = await cough(0);
    expect(stalls).toEqual([]);
    expect(endings).not.toContain('failed');
    expect(log.filter((line) => line.startsWith('text ['))).toEqual([]);
  });
});
