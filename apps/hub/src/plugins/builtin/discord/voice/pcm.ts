import { toSpeech } from '../../../../assistant-voice/audio';
import { Opus } from '../../../../assistant-voice/opus';

const DISCORD_RATE = 48_000;
const DISCORD_CHANNELS = 2;

function monoOf(stereo: Int16Array): Int16Array {
  const mono = new Int16Array(Math.floor(stereo.length / DISCORD_CHANNELS));
  for (let index = 0; index < mono.length; index++) {
    mono[index] = Math.round(
      ((stereo[index * 2] ?? 0) + (stereo[index * 2 + 1] ?? 0)) / DISCORD_CHANNELS,
    );
  }
  return mono;
}

export class SpeechDecoder {
  private readonly codec = new Opus(DISCORD_RATE, DISCORD_CHANNELS);

  decode(packet: Uint8Array): Int16Array {
    return toSpeech(monoOf(this.codec.decode(packet)));
  }

  free(): void {
    this.codec.free();
  }
}
