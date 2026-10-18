import { describe, expect, it } from 'vitest';
import { speechInput, type SpeechInput } from '../../src/assistant-voice/speech-input';
import { MicMeter } from '../../src/assistant-voice/mic-meter';

async function gatedClient(starts: number[], audio: number[]): Promise<SpeechInput> {
  return speechInput(
    'gated-client',
    {
      start: (firstSample): void => {
        starts.push(firstSample);
      },
      audio: (pcm): void => {
        audio.push(pcm.length);
      },
      end: (): void => undefined,
      failed: (): void => undefined,
    },
    {
      assistantAudible: () => false,
      now: () => 0,
      meter: new MicMeter(
        () => 0,
        (): void => undefined,
      ),
      voice: (): void => undefined,
    },
  );
}

describe('client-detected speech', () => {
  it('starts the sentence at the first sample that follows the activity signal', async () => {
    const starts: number[] = [];
    const audio: number[] = [];
    const input = await gatedClient(starts, audio);
    input.hear(new Int16Array(320));
    input.hear(new Int16Array(320));
    input.activity(true);
    input.hear(new Int16Array(160));
    input.activity(false);
    input.hear(new Int16Array(320));
    input.activity(true);
    expect(starts).toStrictEqual([640, 1120]);
    expect(audio).toStrictEqual([160]);
  });
});
