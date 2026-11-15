import { describe, expect, it } from 'vitest';
import { photoFlags, type PhotoFlag } from '@smarteverything/domain';
import { hasMarks, takenText, tileLabel, tileMarks, tileState } from './marks';
import { sameTile, type MediaTile } from './tiles';

function tile(flags: readonly PhotoFlag[], extra: Partial<MediaTile> = {}): MediaTile {
  return {
    id: 'a',
    rev: 1,
    aspect: 1.5,
    takenAt: 0,
    offsetMin: 0,
    durationMs: null,
    flags: photoFlags(flags),
    local: false,
    ...extra,
  };
}

const WHEN = takenText({ takenAt: 0, offsetMin: 0 });

describe('tile marks', () => {
  it('shows LIVE, stack, favourite, duration and only on this device', () => {
    expect(tileMarks(tile(['live', 'stack', 'favourite']))).toEqual({
      live: true,
      stack: true,
      favourite: true,
      video: false,
      duration: null,
      local: false,
    });
    const video = tileMarks(tile(['video'], { durationMs: 42_000, local: true }));
    expect(video?.duration).toBe('0:42');
    expect(video?.local).toBe(true);
    const plain = tileMarks(tile([]));
    expect(plain === null ? null : hasMarks(plain)).toBe(false);
  });

  it('does not mark a known backed-up local file as only on this device', () => {
    const backedUp = tile([], { local: true, backedUp: true });
    expect(tileMarks(backedUp)?.local).toBe(false);
    expect(sameTile(backedUp, { ...backedUp, backedUp: false })).toBe(false);
    expect(tileLabel(backedUp)).toBe(`Photo, ${WHEN}`);
    expect(tileMarks(tile([], { local: true, backedUp: false }))?.local).toBe(true);
    expect(tileLabel(tile([], { local: true, backedUp: false }))).toBe(
      `Photo, ${WHEN}, Only on this device`,
    );
  });

  it('shows no marks while an item is still processing or cannot be read', () => {
    expect(tileState(tile(['processing', 'favourite']))).toBe('processing');
    expect(tileMarks(tile(['processing', 'favourite']))).toBeNull();
    expect(tileState(tile(['unreadable', 'processing']))).toBe('unreadable');
    expect(tileMarks(tile(['unreadable']))).toBeNull();
  });

  it('labels the tile for screen readers with when it was taken', () => {
    expect(tileLabel(tile(['video', 'favourite'], { durationMs: 90_000, local: true }))).toBe(
      `Video, ${WHEN}, 1:30, Favourite, Only on this device`,
    );
    expect(tileLabel(tile(['live']))).toBe(`Live photo, ${WHEN}`);
    expect(tileLabel(tile(['processing']))).toBe(`Photo, ${WHEN}, Still processing`);
    expect(tileLabel(tile(['unreadable']))).toBe(`Photo, ${WHEN}, Can't show this file`);
  });

  it('tells the taken time on the wall clock of the photo', () => {
    const at = Date.UTC(2026, 10, 12, 10, 15);
    expect(takenText({ takenAt: at - 60 * 60_000, offsetMin: 60 })).toBe(
      takenText({ takenAt: at, offsetMin: 0 }),
    );
    expect(takenText({ takenAt: at, offsetMin: 0 })).toBe(
      new Intl.DateTimeFormat(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'UTC',
      }).format(new Date(at)),
    );
  });
});
