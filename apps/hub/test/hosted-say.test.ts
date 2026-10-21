import {
  ASSISTANT_VOICE_SETTINGS,
  NO_PRICES,
  SPEECH_SAMPLE_RATE,
  type AiUsageRow,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ToolSpec } from '../src/ai-tools/hub-tool';
import { opusCodec } from '../src/assistant-voice/audio';
import { hostedSet } from '../src/assistant-voice/voice-tools';
import { CONVERSATION } from '../src/reach/hosted-call';
import { speechConfigOf } from '../src/speech/gemini-speech';
import { OneShotSpeech } from '../src/speech/one-shot-speech';
import type { SpeechChunk, SpeechOptions, SpeechProvider } from '../src/speech/speech-provider';
import { testLogger } from './support/logs';
import { testStore, type TestStore } from './support/store';

const SPEECH = new Int16Array(4800).fill(1200);

function fakeProvider(heard: SpeechOptions[]): SpeechProvider {
  return {
    synthesize: async function* (options): AsyncGenerator<SpeechChunk> {
      heard.push(options);
      await Promise.resolve();
      yield { kind: 'audio', pcm: SPEECH };
      yield { kind: 'usage', usage: { inputTokens: 4, audioTokens: 40 } };
    },
  };
}

let opened: TestStore;

beforeEach(async () => {
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

describe('saying something once', () => {
  it('speaks the exact text with no chat, no transcript and one ledger row', async () => {
    const heard: SpeechOptions[] = [];
    const packets: Uint8Array[] = [];
    let said = 0;
    const profileId = opened.store.profiles.first().id;
    const messagesBefore = opened.store.assistantChat.recent(profileId, 50);
    const rows: AiUsageRow[] = [];
    opened.store.ledger.on((row) => {
      rows.push(row);
    });
    const speech = new OneShotSpeech({
      store: opened.store,
      providers: { gemini: fakeProvider(heard) },
      prices: {
        priceOf: (): typeof NO_PRICES => ({
          ...NO_PRICES,
          input_per_mtok: 0.5,
          audio_out_per_mtok: 6,
        }),
      },
      log: testLogger('say'),
    });
    const saying = await speech.say({
      id: '1d000000-0000-4000-8000-000000000041',
      profileId,
      clientId: null,
      text: 'Dinner is ready',
      sink: {
        audio: (packet): void => {
          packets.push(packet);
        },
        said: (): void => {
          said += 1;
        },
        ended: () => undefined,
      },
    });
    await saying.end('finished');
    expect(heard.map((options) => options.text)).toEqual(['Dinner is ready']);
    expect(packets.length).toBeGreaterThan(0);
    expect(said).toBe(1);
    const codec = opusCodec();
    const decoded = packets.flatMap((packet) => Array.from(codec.decode(packet)));
    codec.free();
    expect(Math.max(...decoded.map(Math.abs))).toBeGreaterThan(500);
    expect(opened.store.assistantChat.recent(profileId, 50)).toEqual(messagesBefore);
    const usage = rows[0];
    expect(usage?.work).toBe('speak');
    expect(usage?.cost_micros).toBe(Math.round(4 * 0.5 + 40 * 6));
    expect(usage?.audio_out_ms).toBe(Math.round((SPEECH.length * 1000) / SPEECH_SAMPLE_RATE));
  });

  it('hides the reach tools from hosted conversations', () => {
    const set: ToolSpec[] = ['device_read', 'voice_speak', 'call_start', 'call_end'].map(
      (name) => ({
        name,
        description: name,
        inputSchema: {},
      }),
    );
    expect(hostedSet(set, CONVERSATION).map((entry) => entry.name)).toEqual(['device_read']);
    expect(hostedSet(set, null)).toHaveLength(4);
  });
});

describe('the speech voice', () => {
  it('rejects a misspelled voice name and accepts the real one', () => {
    expect(ASSISTANT_VOICE_SETTINGS.safeParse({ voice: 'Sadachibia' }).success).toBe(false);
    expect(ASSISTANT_VOICE_SETTINGS.safeParse({ speech_voice: 'Nope' }).success).toBe(false);
    expect(ASSISTANT_VOICE_SETTINGS.parse({ voice: 'Sadachbia' }).voice).toBe('Sadachbia');
  });

  it('builds a speech config with the voice and no language code', () => {
    const config = speechConfigOf('Sadachbia');
    expect(config.voiceConfig?.prebuiltVoiceConfig?.voiceName).toBe('Sadachbia');
    expect(config.languageCode).toBeUndefined();
  });
});
