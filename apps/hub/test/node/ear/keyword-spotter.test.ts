import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { WakeSensitivity } from '@smarteverything/domain';
import { realSpotter } from './real-spotter';

function fixture(name: string): Int16Array {
  const bytes = readFileSync(new URL(`../../assistant/fixtures/${name}.pcm`, import.meta.url));
  return new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

function padded(pcm: Int16Array): Int16Array {
  const out = new Int16Array(pcm.length + 16_000 * 3);
  out.set(pcm, 16_000);
  return out;
}

function spotted(
  names: readonly string[],
  name: string,
  sensitivity: WakeSensitivity = 'standard',
): string | null {
  const { spotter, engine } = realSpotter(names, sensitivity);
  const listening = spotter.listen(sensitivity);
  if (listening === null) {
    return null;
  }
  const pcm = padded(fixture(name));
  let heard: string | null = null;
  for (let offset = 0; offset < pcm.length; offset += 320) {
    heard ??= listening.hear(pcm.slice(offset, offset + 320));
  }
  listening.free();
  engine.free();
  return heard;
}

describe('keyword spotter on recorded fixtures', () => {
  it('hears "hey <name>" in two voices', () => {
    expect(spotted(['Coordinator'], 'hw_us1')).toBe('hey Coordinator');
    expect(spotted(['Coordinator'], 'hw_gb2')).toBe('hey Coordinator');
  }, 30_000);

  it('hears the bare name inside ordinary talk, with no greeting', () => {
    expect(spotted(['Coordinator'], 'nm_talk')).toBe('Coordinator');
    expect(spotted(['Coordinator'], 'far_nm_coord')).toBe('Coordinator');
  }, 30_000);

  it('ignores speech that does not contain the name', () => {
    expect(spotted(['Coordinator'], 'person')).toBeNull();
    expect(spotted(['Coordinator'], 'ai')).toBeNull();
    expect(spotted(['Coordinator'], 'nm_coord')).toBeNull();
    expect(spotted(['Jarvis'], 'hw_us1')).toBeNull();
  }, 30_000);

  it('hears a far, quiet call at the standard sensitivity', () => {
    expect(spotted(['Coordinator'], 'far_quiet_hw_us')).toBe('hey Coordinator');
  }, 30_000);

  it('hears the name in the middle of a sentence without a pause around it', () => {
    const pcm = fixture('hw_gb2');
    const sentence = new Int16Array(pcm.length * 3);
    sentence.set(fixture('nm_talk').slice(0, pcm.length), 0);
    sentence.set(pcm, pcm.length);
    sentence.set(fixture('nm_talk').slice(0, pcm.length), pcm.length * 2);
    const { spotter, engine } = realSpotter(['Coordinator']);
    const listening = spotter.listen('standard');
    let heardAt: number | null = null;
    for (let offset = 0; offset < sentence.length && heardAt === null; offset += 320) {
      if (listening?.hear(sentence.slice(offset, offset + 320)) === 'hey Coordinator') {
        heardAt = offset;
      }
    }
    listening?.free();
    engine.free();
    expect(heardAt).not.toBeNull();
    expect(heardAt ?? Infinity).toBeLessThan(pcm.length * 2);
  }, 30_000);

  it('follows a rename without retraining', () => {
    expect(spotted(['Jarvis'], 'hw_jarvis')).toBe('hey Jarvis');
    expect(spotted(['Jarvis'], 'hw_us1')).toBeNull();
  }, 30_000);
});
