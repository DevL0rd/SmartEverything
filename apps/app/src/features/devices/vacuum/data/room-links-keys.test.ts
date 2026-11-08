import { describe, expect, it } from 'vitest';
import { vacuumDeviceScenesKey, vacuumRoomLinksKey, vacuumSceneKey } from './keys';
import { linksKeyPart } from './room-links-value';

describe('room links in the vacuum query keys', () => {
  it('refetches the scene when the published room links change', () => {
    const before = vacuumSceneKey('d', 'current', '3:current', linksKeyPart(undefined));
    const after = vacuumSceneKey(
      'd',
      'current',
      '3:current',
      linksKeyPart('{"linked":1,"unlinked":4,"stale":0}'),
    );
    expect(before).not.toStrictEqual(after);
    expect(before.at(-1)).toBe('none');
    expect(linksKeyPart('')).toBe('none');
  });

  it('refetches the scene when only the revision changes', () => {
    const key = (value: string): readonly unknown[] =>
      vacuumSceneKey('d', 'current', '3:current', linksKeyPart(value));
    expect(key('{"linked":1,"unlinked":1,"stale":0,"revision":2}')).not.toStrictEqual(
      key('{"linked":1,"unlinked":1,"stale":0,"revision":3}'),
    );
  });

  it('keeps every scene and link list of a robot under the robot scene prefix', () => {
    expect(vacuumSceneKey('d', 'saved', '4:saved', 'none').slice(0, 4)).toStrictEqual(
      vacuumDeviceScenesKey('d'),
    );
    expect(vacuumRoomLinksKey('d', '3:current', 'x')).toStrictEqual([
      'window',
      'vacuum',
      'room-links',
      'd',
      '3:current',
      'x',
    ]);
  });
});
