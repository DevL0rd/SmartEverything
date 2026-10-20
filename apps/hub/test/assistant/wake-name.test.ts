import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type { WakeSensitivity } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { opusCodec } from '../../src/assistant-voice/audio';
import type { Cancel } from '../../src/clock';
import type { MicrophoneHandlers, OpenMicrophone } from '../../src/talk/camera-microphone';
import { CameraEar } from '../../src/wake-name/camera-ear';
import { WakeKeywords, wakePhrases } from '../../src/wake-name/keyword-lines';
import { pieceVocabulary, wordPieces } from '../../src/wake-name/word-pieces';
import { earLoopback, type Loopback } from '../listening/ear-loopback';
import { until } from '../support/wait';
import { captureLogs, type CapturedLogs } from '../support/logs';

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
  const vocabulary = pieceVocabulary(
    readFileSync(new URL('../../src/wake-name/wake-name-model/bpe.vocab', import.meta.url), 'utf8'),
  );
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

describe('keyword lines', () => {
  const lines = new WakeKeywords();

  it('hands a phone the same keyword lines and thresholds the ears use', () => {
    const config = lines.earConfig(['Coordinator', 'Aibi'], 'high');
    expect(config.keywords).toHaveLength(4);
    expect(config.keywords[0]).toMatch(/ @Coordinator$/);
    expect(config.keywords[1]).toMatch(/ @hey_Coordinator$/);
    expect(config.keywords[2]).toMatch(/ @Aibi$/);
    expect(config.keywords[3]).toMatch(/ @hey_Aibi$/);
    expect(config.threshold).toBe(0.1);
    expect(config.nearMissThreshold).toBe(0.04);
    expect(lines.earConfig([], 'standard').keywords).toEqual([]);
  });
});

function fakeMicrophones(
  packets: readonly Uint8Array[],
  ready: () => boolean,
  delivered: () => void,
): {
  readonly open: (cameraId: string, handlers: MicrophoneHandlers) => Promise<OpenMicrophone>;
} {
  return {
    open: async (_cameraId, handlers): Promise<OpenMicrophone> => {
      await until(ready, 'the hosted ear to listen', 20_000);
      setImmediate(() => {
        packets.forEach((packet) => {
          handlers.packet(packet);
        });
        delivered();
      });
      return { stop: () => undefined };
    },
  };
}

let logs: CapturedLogs;
let loopback: Loopback | null = null;

afterEach(async () => {
  await loopback?.stop();
  loopback = null;
});

async function earHears(name: string, busy: boolean): Promise<string[]> {
  logs = captureLogs();
  const heard: string[] = [];
  const timers: Cancel[] = [];
  let delivered = false;
  const hosted = earLoopback(['Coordinator']);
  loopback = hosted;
  const ear = new CameraEar('camera-1', {
    ears: hosted.ears,
    microphones: fakeMicrophones(
      opusPackets(padded(fixture(name))),
      () => logs.events().includes('ear_host.listening') || busy,
      () => {
        delivered = true;
      },
    ),
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
