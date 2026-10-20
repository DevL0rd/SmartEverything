import { describe, expect, it } from 'vitest';
import { AUTOMATIC_HANGOVER_MS } from '@smarteverything/domain';
import {
  liveSessionOf,
  TRAILING_SILENCE_MS,
  type LiveWire,
} from '../../src/assistant-voice/gemini';

function recordingGemini(sent: string[]): LiveWire {
  return {
    sendRealtimeInput: (params): void => {
      sent.push(`realtime ${JSON.stringify(params)}`);
    },
    sendClientContent: (params): void => {
      sent.push(`client ${JSON.stringify(params)}`);
    },
    sendToolResponse: (): void => {
      sent.push('tool');
    },
    close: (): void => undefined,
  };
}

describe('liveSessionOf', () => {
  it('sends a picture as realtime image input, never as client content', () => {
    const sent: string[] = [];
    liveSessionOf(recordingGemini(sent), false).picture({
      data: Buffer.from('jpeg'),
      mimeType: 'image/jpeg',
    });
    expect(sent).toEqual([
      `realtime ${JSON.stringify({
        video: { data: Buffer.from('jpeg').toString('base64'), mimeType: 'image/jpeg' },
      })}`,
    ]);
  });

  it('sends text as client content without any image', () => {
    const sent: string[] = [];
    liveSessionOf(recordingGemini(sent), false).text('hello', false);
    expect(sent).toEqual([
      `client ${JSON.stringify({
        turns: [{ role: 'user', parts: [{ text: 'hello' }] }],
        turnComplete: false,
      })}`,
    ]);
  });

  it('sends activity markers when the gate decides the turn end', () => {
    const sent: string[] = [];
    const session = liveSessionOf(recordingGemini(sent), false);
    session.speaking(true);
    session.speaking(false);
    expect(sent).toEqual([
      `realtime ${JSON.stringify({ activityStart: {} })}`,
      `realtime ${JSON.stringify({ activityEnd: {} })}`,
    ]);
  });

  it('gives Gemini trailing silence and then pauses the stream when the gate closes in Automatic', () => {
    const sent: string[] = [];
    const session = liveSessionOf(recordingGemini(sent), true);
    session.speaking(true);
    session.speaking(false);
    const silence = Buffer.alloc((16_000 * TRAILING_SILENCE_MS * 2) / 1000).toString('base64');
    expect(sent).toEqual([
      `realtime ${JSON.stringify({ audio: { data: silence, mimeType: 'audio/pcm;rate=16000' } })}`,
      `realtime ${JSON.stringify({ audioStreamEnd: true })}`,
    ]);
  });

  it('lets an automatic Gemini end the turn after the gate closes, without the person speaking again', () => {
    const vad = automaticGemini(AUTOMATIC_HANGOVER_MS + 500);
    const session = liveSessionOf(vad.wire, true);
    session.speaking(true);
    session.audio(tone(1000));
    session.audio(new Int16Array(16 * AUTOMATIC_HANGOVER_MS));
    session.speaking(false);
    expect(vad.turnEnded()).toBe(true);
  });
});

function tone(ms: number): Int16Array {
  return Int16Array.from({ length: 16 * ms }, (_, index) => (index % 2 === 0 ? 8000 : -8000));
}

function automaticGemini(endOfSpeechMs: number): { wire: LiveWire; turnEnded: () => boolean } {
  let heardSpeech = false;
  let quietMs = 0;
  let ended = false;
  const hear = (base64: string): void => {
    const bytes = Buffer.from(base64, 'base64');
    const samples = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
    for (const sample of samples) {
      heardSpeech ||= sample !== 0;
      quietMs = sample === 0 ? quietMs + 1 / 16 : 0;
      ended ||= heardSpeech && quietMs >= endOfSpeechMs;
    }
  };
  return {
    wire: {
      sendRealtimeInput: (params): void => {
        if (params.audio?.data !== undefined) {
          hear(params.audio.data);
        }
      },
      sendClientContent: (): void => undefined,
      sendToolResponse: (): void => undefined,
      close: (): void => undefined,
    },
    turnEnded: () => ended,
  };
}
