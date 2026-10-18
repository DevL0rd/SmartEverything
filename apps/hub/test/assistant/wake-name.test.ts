import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { WakeSensitivity } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { sileroModel } from '../../src/assistant-voice/silero-vad';
import { opusCodec } from '../../src/assistant-voice/audio';
import type { Cancel } from '../../src/clock';
import type { MicrophoneHandlers, OpenMicrophone } from '../../src/talk/camera-microphone';
import type { WakeGrant } from '../../src/wake-name/wake-claims';
import { CameraEar } from '../../src/wake-name/camera-ear';
import { KeywordSpotter, modelDirectory, wakePhrases } from '../../src/wake-name/keyword-spotter';
import { pieceVocabulary, wordPieces } from '../../src/wake-name/word-pieces';
import { until } from '../support/wait';

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

function spotted(
  spotter: KeywordSpotter,
  names: readonly string[],
  name: string,
  sensitivity: WakeSensitivity = 'standard',
): string | null {
  const listening = spotter.listen(names, sensitivity);
  if (listening === null) {
    return null;
  }
  const pcm = padded(fixture(name));
  let heard: string | null = null;
  for (let offset = 0; offset < pcm.length; offset += 320) {
    heard ??= listening.hear(pcm.slice(offset, offset + 320));
  }
  listening.free();
  return heard;
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

describe('wake phrases', () => {
  it('listens for each name alone and after "hey", once per name, ignoring blanks and letter case', () => {
    expect(wakePhrases([' Jarvis ', 'jarvis', '', '  ', 'Aibi'])).toEqual([
      'Jarvis',
      'hey Jarvis',
      'Aibi',
      'hey Aibi',
    ]);
    expect(wakePhrases([])).toEqual([]);
  });

  it('wakes on the bare name wherever it is said, with no greeting needed', () => {
    expect(wakePhrases(['Coordinator'])).toContain('Coordinator');
  });
});

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

  it('hands a phone the same keyword lines and thresholds the hub ears use', () => {
    const config = spotter.earConfig(['Coordinator', 'Aibi'], 'high');
    expect(config.keywords).toHaveLength(4);
    expect(config.keywords[0]).toMatch(/ @Coordinator$/);
    expect(config.keywords[1]).toMatch(/ @hey_Coordinator$/);
    expect(config.keywords[2]).toMatch(/ @Aibi$/);
    expect(config.keywords[3]).toMatch(/ @hey_Aibi$/);
    expect(config.threshold).toBe(0.1);
    expect(config.nearMissThreshold).toBe(0.04);
    expect(spotter.earConfig([], 'standard').keywords).toEqual([]);
  });

  it('hears "hey <name>" in two voices', () => {
    expect(spotted(spotter, ['Coordinator'], 'hw_us1')).toBe('hey Coordinator');
    expect(spotted(spotter, ['Coordinator'], 'hw_gb2')).toBe('hey Coordinator');
  }, 30_000);

  it('hears the bare name inside ordinary talk, with no greeting', () => {
    expect(spotted(spotter, ['Coordinator'], 'nm_talk')).toBe('Coordinator');
    expect(spotted(spotter, ['Coordinator'], 'far_nm_coord')).toBe('Coordinator');
  }, 30_000);

  it('ignores speech that does not contain the name', () => {
    expect(spotted(spotter, ['Coordinator'], 'person')).toBeNull();
    expect(spotted(spotter, ['Coordinator'], 'ai')).toBeNull();
    expect(spotted(spotter, ['Coordinator'], 'nm_coord')).toBeNull();
    expect(spotted(spotter, ['Jarvis'], 'hw_us1')).toBeNull();
  }, 30_000);

  it('hears a far, quiet call at the standard sensitivity', () => {
    expect(spotted(spotter, ['Coordinator'], 'far_quiet_hw_us')).toBe('hey Coordinator');
  }, 30_000);

  it('hears the name in the middle of a sentence without a pause around it', () => {
    const pcm = fixture('hw_gb2');
    const sentence = new Int16Array(pcm.length * 3);
    sentence.set(fixture('nm_talk').slice(0, pcm.length), 0);
    sentence.set(pcm, pcm.length);
    sentence.set(fixture('nm_talk').slice(0, pcm.length), pcm.length * 2);
    const listening = spotter.listen(['Coordinator'], 'standard');
    let heardAt: number | null = null;
    for (let offset = 0; offset < sentence.length && heardAt === null; offset += 320) {
      if (listening?.hear(sentence.slice(offset, offset + 320)) === 'hey Coordinator') {
        heardAt = offset;
      }
    }
    listening?.free();
    expect(heardAt).not.toBeNull();
    expect(heardAt ?? Infinity).toBeLessThan(pcm.length * 2);
  }, 30_000);

  it('follows a rename without retraining', () => {
    expect(spotted(spotter, ['Jarvis'], 'hw_jarvis')).toBe('hey Jarvis');
    expect(spotted(spotter, ['Jarvis'], 'hw_us1')).toBeNull();
  }, 30_000);
});

function fakeMicrophones(
  packets: readonly Uint8Array[],
  delivered: () => void,
): {
  readonly open: (cameraId: string, handlers: MicrophoneHandlers) => Promise<OpenMicrophone>;
} {
  return {
    open: (_cameraId, handlers): Promise<OpenMicrophone> => {
      setImmediate(() => {
        packets.forEach((packet) => {
          handlers.packet(packet);
        });
        delivered();
      });
      return Promise.resolve({ stop: () => undefined });
    },
  };
}

async function earHears(name: string, busy: boolean): Promise<string[]> {
  const heard: string[] = [];
  const timers: Cancel[] = [];
  let delivered = false;
  const ear = new CameraEar('camera-1', {
    claims: { request: (): WakeGrant => ({ granted: true, onSuperseded: (): void => undefined }) },
    microphones: fakeMicrophones(opusPackets(padded(fixture(name))), () => {
      delivered = true;
    }),
    spotter: new KeywordSpotter(),
    model: sileroModel,
    names: (): string[] => ['Coordinator'],
    pauseMs: (): 200 => 200,
    sensitivity: (): WakeSensitivity => 'standard',
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
  await until(() => delivered, 'the camera audio');
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

  it('wakes on the bare name inside ordinary talk', async () => {
    expect(await earHears('nm_talk', false)).toEqual(['camera-1: Coordinator']);
  }, 30_000);

  it('stays quiet for speech that does not contain the name', async () => {
    expect(await earHears('person', false)).toEqual([]);
  }, 30_000);
});
