import { describe, expect, it } from 'vitest';
import { compactPartsOf, remoteLayoutOf } from './remote-layout';

describe('television remote layout', () => {
  it('picks the face from the real frame so nothing is clipped', () => {
    expect(remoteLayoutOf({ width: 144, height: 190 })).toBe('tile');
    expect(remoteLayoutOf({ width: 326, height: 140 })).toBe('compact');
    expect(remoteLayoutOf({ width: 508, height: 120 })).toBe('compact');
    expect(remoteLayoutOf({ width: 326, height: 180 })).toBe('card');
    expect(remoteLayoutOf({ width: 326, height: 324 })).toBe('tall');
    expect(remoteLayoutOf({ width: 1072, height: 296 })).toBe('tall');
    expect(remoteLayoutOf({ width: 1072, height: 120 })).toBe('wide');
  });

  it('keeps the chips row out of frames that cannot hold it', () => {
    expect(compactPartsOf({ width: 326, height: 140 }).chips).toBe(false);
    expect(compactPartsOf({ width: 326, height: 168 }).chips).toBe(true);
  });

  it('drops the play key, then the mute key, then the ring as the width shrinks', () => {
    expect(compactPartsOf({ width: 326, height: 140 })).toMatchObject({ ring: true, play: true });
    expect(compactPartsOf({ width: 300, height: 140 })).toMatchObject({ ring: true, play: false });
    expect(compactPartsOf({ width: 280, height: 140 })).toMatchObject({ ring: false, play: true });
    expect(compactPartsOf({ width: 160, height: 140 })).toMatchObject({
      ring: false,
      mute: false,
      play: false,
    });
  });
});
