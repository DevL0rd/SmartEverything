import { describe, expect, it } from 'vitest';
import type { PhotoSource } from '@smarteverything/domain';
import { chatFileOf, type ChatDeps } from './source-actions';
import type { SourceTile } from './source-model';

const TILE: SourceTile = {
  id: 'rec-1',
  chipId: 'front-door',
  madeAt: Date.parse('2026-11-07T08:00:00Z'),
  day: '2026-11-07',
  kept: false,
  video: true,
  durationMs: 32_000,
  name: 'front door.mp4',
  mime: 'video/mp4',
  bytes: 4_000_000,
};

function depsOf(url: string | null): ChatDeps & { readonly asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    fileUrl: (source: PhotoSource, id: string): Promise<string | null> => {
      asked.push(`${source}:${id}`);
      return Promise.resolve(url);
    },
    fetchBytes: (fetched) => Promise.resolve(new TextEncoder().encode(fetched).buffer),
  };
}

describe('sending a camera clip to the chat', () => {
  it('attaches the clip with its name, type and size and reads it only when sent', async () => {
    const deps = depsOf('https://hub/clip');
    const file = chatFileOf('cameras', TILE, deps);
    expect(file).toMatchObject({ name: 'front door.mp4', mime: 'video/mp4', bytes: 4_000_000 });
    expect(deps.asked).toEqual([]);
    const data = await file.data();
    expect(new TextDecoder().decode(data)).toBe('https://hub/clip');
    expect(deps.asked).toEqual(['cameras:rec-1']);
  });

  it('fails loudly when the hub gives no link', async () => {
    const file = chatFileOf('cameras', TILE, depsOf(null));
    await expect(file.data()).rejects.toThrow('The hub gave no link for front door.mp4');
  });
});
