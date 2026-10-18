import { describe, expect, it } from 'vitest';
import { OPUS_SILENCE } from '../../src/reach/voice-pacing';
import { continuousSpeaker } from '../../src/talk/live-sessions';
import { pause, until } from '../support/wait';

describe('continuousSpeaker for camera members of a live channel', () => {
  it('fills silence between the AI turns and stops at the end', async () => {
    const sent: Uint8Array[] = [];
    let ended = false;
    const speaker = continuousSpeaker({
      packet: (packet): void => {
        sent.push(packet);
      },
      end: (): void => {
        ended = true;
      },
    });
    const speech = Uint8Array.of(9, 9, 9);
    speaker.packet(speech);
    await until(() => sent.filter((packet) => packet === OPUS_SILENCE).length >= 3, 'idle silence');
    speaker.end();
    const count = sent.length;
    await pause(100);
    expect(sent.filter((packet) => packet === speech)).toHaveLength(1);
    expect(sent.filter((packet) => packet === OPUS_SILENCE)).toHaveLength(count - 1);
    expect(sent).toHaveLength(count);
    expect(ended).toBe(true);
  });
});
