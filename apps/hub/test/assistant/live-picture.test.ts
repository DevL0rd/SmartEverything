import { describe, expect, it } from 'vitest';
import { liveSessionOf, type LiveWire } from '../../src/assistant-voice/gemini';

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
    liveSessionOf(recordingGemini(sent)).picture({
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
    liveSessionOf(recordingGemini(sent)).text('hello', false);
    expect(sent).toEqual([
      `client ${JSON.stringify({
        turns: [{ role: 'user', parts: [{ text: 'hello' }] }],
        turnComplete: false,
      })}`,
    ]);
  });
});
