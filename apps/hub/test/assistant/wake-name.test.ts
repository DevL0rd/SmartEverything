import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Logger } from '@smarteverything/logging';
import { sileroModel } from '../../src/assistant-voice/silero-vad';
import { opusCodec } from '../../src/assistant-voice/audio';
import type { Cancel } from '../../src/clock';
import type { MicrophoneHandlers, OpenMicrophone } from '../../src/talk/camera-microphone';
import { CameraEar } from '../../src/wake-name/camera-ear';
import {
  KeywordSpotter,
  modelDirectory,
  type SegmentResult,
} from '../../src/wake-name/keyword-spotter';
import { pieceVocabulary, wordPieces } from '../../src/wake-name/word-pieces';

const FRAME_48K = 960;

function fixture(name: string): Int16Array {
  const bytes = readFileSync(new URL(`fixtures/${name}.pcm`, import.meta.url));
  return new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

function padded(pcm: Int16Array): Int16Array {
  const out = new Int16Array(pcm.length + 16_000 * 3);
  out.set(pcm, 16_000);
  return out;
}

function segment(spotter: KeywordSpotter, names: readonly string[], name: string): SegmentResult {
  const listening = spotter.listen(names);
  if (listening === null) {
    return { heard: null, nearMiss: null };
  }
  const pcm = padded(fixture(name));
  let heard: string | null = null;
  for (let offset = 0; offset < pcm.length; offset += 1600) {
    heard ??= listening.hear(pcm.slice(offset, offset + 1600));
  }
  const result = listening.finish();
  return { heard: heard ?? result.heard, nearMiss: result.nearMiss };
}

function spotted(spotter: KeywordSpotter, names: readonly string[], name: string): string | null {
  return segment(spotter, names, name).heard;
}

function opusPackets(pcm16k: Int16Array): Uint8Array[] {
  const codec = opusCodec();
  const up = Int16Array.from(
    { length: pcm16k.length * 3 },
    (_, index) => pcm16k[Math.floor(index / 3)] ?? 0,
  );
  const packets: Uint8Array[] = [];
  for (let offset = 0; offset + FRAME_48K <= up.length; offset += FRAME_48K) {
    packets.push(codec.encode(up.slice(offset, offset + FRAME_48K)));
  }
  codec.free();
  return packets;
}

describe('word pieces', () => {
  const vocabulary = pieceVocabulary(readFileSync(`${modelDirectory()}bpe.vocab`, 'utf8'));
  it.each([
    ['hey Coordinator', '▁HE Y ▁CO OR D IN AT OR'],
    ['hey Aibi', '▁HE Y ▁A I B I'],
    ['Hey, Jarvis!', '▁HE Y ▁JA R VI S'],
    ['hey friday', '▁HE Y ▁F RI DAY'],
    ['hey assistant', '▁HE Y ▁AS S IST ANT'],
  ])('splits %s exactly like SentencePiece', (phrase, pieces) => {
    expect(wordPieces(vocabulary, phrase)?.join(' ')).toBe(pieces);
  });

  it('gives nothing for text without letters', () => {
    expect(wordPieces(vocabulary, '🙂 123')).toBeNull();
  });
});

describe('keyword spotter on recorded fixtures', () => {
  const spotter = new KeywordSpotter();

  it('hears "hey <name>" in two voices', () => {
    expect(spotted(spotter, ['Coordinator'], 'hw_us1')).toBe('hey Coordinator');
    expect(spotted(spotter, ['Coordinator'], 'hw_gb2')).toBe('hey Coordinator');
  }, 30_000);

  it('ignores the bare name, near misses and the AI talking about itself', () => {
    expect(spotted(spotter, ['Coordinator'], 'nm_talk')).toBeNull();
    expect(spotted(spotter, ['Coordinator'], 'ai_self')).toBeNull();
    expect(spotted(spotter, ['Coordinator'], 'nm_coord')).toBeNull();
  }, 30_000);

  it('reports a quiet call that scored under the threshold as a near miss', () => {
    expect(segment(spotter, ['Coordinator'], 'far_quiet_hw_us')).toEqual({
      heard: null,
      nearMiss: 'hey Coordinator',
    });
  }, 30_000);

  it('follows a rename without retraining', () => {
    expect(spotted(spotter, ['Jarvis'], 'hw_jarvis')).toBe('hey Jarvis');
    expect(spotted(spotter, ['Jarvis'], 'hw_us1')).toBeNull();
  }, 30_000);
});

function fakeMicrophones(packets: readonly Uint8Array[]): {
  readonly open: (cameraId: string, handlers: MicrophoneHandlers) => Promise<OpenMicrophone>;
} {
  return {
    open: (_cameraId, handlers): Promise<OpenMicrophone> => {
      setImmediate(() => {
        packets.forEach((packet) => {
          handlers.packet(packet);
        });
      });
      return Promise.resolve({ stop: () => undefined });
    },
  };
}

async function earHears(name: string, busy: boolean): Promise<string[]> {
  const heard: string[] = [];
  const timers: Cancel[] = [];
  const ear = new CameraEar('camera-1', {
    microphones: fakeMicrophones(opusPackets(padded(fixture(name)))),
    spotter: new KeywordSpotter(),
    model: sileroModel,
    names: (): string[] => ['Coordinator'],
    busy: (): boolean => busy,
    heard: (cameraId, phrase): void => {
      heard.push(`${cameraId}: ${phrase}`);
    },
    clock: {
      now: (): Date => new Date(),
      at: (): Cancel => {
        const cancel: Cancel = (): void => undefined;
        timers.push(cancel);
        return cancel;
      },
    },
    log: new Logger('hub.test'),
  });
  await ear.open();
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await ear.close();
  return heard;
}

describe('camera ear', () => {
  it('wakes once from camera Opus audio', async () => {
    expect(await earHears('hw_us1', false)).toEqual(['camera-1: hey Coordinator']);
  }, 30_000);

  it('stays quiet while that camera already has a conversation', async () => {
    expect(await earHears('hw_us1', true)).toEqual([]);
  }, 30_000);

  it('wakes from a far, reverberant, noisy call after speech levelling', async () => {
    expect(await earHears('far_hw_us', false)).toEqual(['camera-1: hey Coordinator']);
  }, 30_000);

  it('stays quiet for a far near miss', async () => {
    expect(await earHears('far_nm_coord', false)).toEqual([]);
  }, 30_000);

  it('stays quiet for other speech', async () => {
    expect(await earHears('nm_talk', false)).toEqual([]);
  }, 30_000);
});
