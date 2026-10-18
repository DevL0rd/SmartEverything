import type { EarCodec } from '@smarteverything/domain';
import { toSpeech } from '../../assistant-voice/audio';
import { Opus } from '../../assistant-voice/opus';

const RELAY_RATE = 48_000;
const STEREO = 2;

export interface PacketDecoder {
  readonly decode: (packet: Uint8Array) => Int16Array;
  readonly free: () => void;
}

function monoOf(stereo: Int16Array): Int16Array {
  const mono = new Int16Array(Math.floor(stereo.length / STEREO));
  for (let index = 0; index < mono.length; index++) {
    mono[index] = Math.round(((stereo[index * 2] ?? 0) + (stereo[index * 2 + 1] ?? 0)) / STEREO);
  }
  return mono;
}

function decoderOver(channels: number, reduce: (pcm: Int16Array) => Int16Array): PacketDecoder {
  const codec = new Opus(RELAY_RATE, channels);
  return {
    decode: (packet) => toSpeech(reduce(codec.decode(packet))),
    free: (): void => {
      codec.free();
    },
  };
}

export function packetDecoderFor(codec: EarCodec): PacketDecoder {
  switch (codec) {
    case 'opus_48k_mono':
      return decoderOver(1, (pcm) => pcm);
    case 'opus_48k_stereo':
      return decoderOver(STEREO, monoOf);
  }
}
