import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_SETTINGS,
  ASSISTANT_SETTINGS_CHANGE,
  patchAssistantSettings,
} from '../src/index';

const stored = ASSISTANT_SETTINGS.parse({
  name: 'Mo Mo',
  aliases: ['momo'],
  instructions: 'be brief',
  voice: { idle_seconds: 30, live_video: true },
  reuse_chat_minutes: 10,
});

describe('assistant settings change', () => {
  it('keeps exactly the fields that were sent', () => {
    expect(ASSISTANT_SETTINGS_CHANGE.parse({ aliases: ['a'] })).toEqual({ aliases: ['a'] });
    expect(ASSISTANT_SETTINGS_CHANGE.parse({ voice: { live_video: false } })).toEqual({
      voice: { live_video: false },
    });
    expect(ASSISTANT_SETTINGS_CHANGE.parse({ response_style: { format: 'adaptive' } })).toEqual({
      response_style: { format: 'adaptive' },
    });
  });

  it('refuses an empty change and unknown voice keys', () => {
    expect(ASSISTANT_SETTINGS_CHANGE.safeParse({}).success).toBe(false);
    expect(ASSISTANT_SETTINGS_CHANGE.safeParse({ voice: { nonsense: 1 } }).success).toBe(false);
  });

  it('adds an alias without touching the name or the voice', () => {
    const next = patchAssistantSettings(
      stored,
      ASSISTANT_SETTINGS_CHANGE.parse({ aliases: ['momo', 'mo'] }),
    );
    expect(next).toEqual({ ...stored, aliases: ['momo', 'mo'] });
  });

  it('changes one voice field and keeps the other voice fields', () => {
    const next = patchAssistantSettings(
      stored,
      ASSISTANT_SETTINGS_CHANGE.parse({ voice: { idle_seconds: 60 } }),
    );
    expect(next.voice).toEqual({ ...stored.voice, idle_seconds: 60 });
    expect(next.name).toBe('Mo Mo');
  });

  it('changes one response style field and keeps the others', () => {
    const base = patchAssistantSettings(
      stored,
      ASSISTANT_SETTINGS_CHANGE.parse({ response_style: { personality: 'custom' } }),
    );
    const next = patchAssistantSettings(
      base,
      ASSISTANT_SETTINGS_CHANGE.parse({ response_style: { verbosity: 'brief' } }),
    );
    expect(next.response_style).toMatchObject({ personality: 'custom', verbosity: 'brief' });
  });
});
