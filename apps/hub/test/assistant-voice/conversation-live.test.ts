import { ASSISTANT_VOICE_SETTINGS } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { liveOptionsOf } from '../../src/assistant-voice/conversation-live';
import type { SpeechPause, SpeechSource } from '../../src/assistant-voice/speech-input';

type Hooks = Parameters<typeof liveOptionsOf>[0];

function hooksOf(speech: SpeechSource, pauseMs: 0 | 200 | 640 | null): Hooks {
  const pause: SpeechPause = {
    ms: () => pauseMs ?? 0,
    onChange: () => (): void => undefined,
  };
  return {
    speech,
    ...(pauseMs === null ? {} : { pause }),
    settings: () => ASSISTANT_VOICE_SETTINGS.parse({}),
    window: () => null,
    system: () => 'system',
    tools: () => [],
    webSearch: () => false,
  };
}

describe('who decides when the person is done', () => {
  it.each(['gated-client', 'echo-cancelled'] as const)(
    'leaves it to Gemini on a %s call set to Automatic',
    (speech) => {
      expect(liveOptionsOf(hooksOf(speech, 0), null, null).automatic).toBe(true);
    },
  );

  it.each(['gated-client', 'echo-cancelled'] as const)(
    'keeps the gate in charge on a %s call with an explicit pause',
    (speech) => {
      expect(liveOptionsOf(hooksOf(speech, 640), null, null).automatic).toBe(false);
      expect(liveOptionsOf(hooksOf(speech, 200), null, null).automatic).toBe(false);
    },
  );

  it('always leaves it to Gemini when the audio is streamed', () => {
    expect(liveOptionsOf(hooksOf('raw', 640), null, null).automatic).toBe(true);
    expect(liveOptionsOf(hooksOf('echo-free', null), null, null).automatic).toBe(true);
  });
});

describe('the model follows the thinking level', () => {
  const optionsFor = (thinking_level: 'off' | 'low' | 'high'): ReturnType<typeof liveOptionsOf> =>
    liveOptionsOf(
      {
        ...hooksOf('gated-client', null),
        settings: () => ASSISTANT_VOICE_SETTINGS.parse({ thinking_level }),
      },
      null,
      null,
    );

  it('uses the quick model with no thinking when off', () => {
    const options = optionsFor('off');
    expect(options.model).toBe('gemini-3.8-live');
    expect(options).not.toHaveProperty('thinking');
  });

  it('uses the extended thinking model at the chosen level above off', () => {
    expect(optionsFor('low')).toMatchObject({
      model: 'gemini-3.8-live-extended-thinking',
      thinking: 'low',
    });
    expect(optionsFor('high')).toMatchObject({ thinking: 'high' });
  });
});
