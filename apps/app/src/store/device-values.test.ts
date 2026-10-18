import { describe, expect, it } from 'vitest';
import { DeviceValueIndex } from './device-values';
import type { DeviceValues } from './state';

const reading = (value: number): DeviceValues => ({ level: { value, observedAt: 'x' } });
const ids = Array.from({ length: 200 }, (_, index) => `device-${String(index).padStart(4, '0')}`);

function changed(before: DeviceValueIndex, after: DeviceValueIndex): string[] {
  const found: string[] = [];
  before.changedIds(after, (id) => found.push(id));
  return found.sort();
}

describe('DeviceValueIndex', () => {
  const index = DeviceValueIndex.from(ids.map((id, at) => [id, reading(at)]));

  it('reads back every device and counts them', () => {
    expect(index.size).toBe(ids.length);
    expect(index.get('device-0042')).toStrictEqual(reading(42));
    expect(index.get('missing')).toBeUndefined();
    expect([...index.entries()]).toHaveLength(ids.length);
  });

  it('replaces one device and leaves every other value identical', () => {
    const next = index.set('device-0007', reading(99));
    expect(next).not.toBe(index);
    expect(next.size).toBe(ids.length);
    expect(next.get('device-0007')).toStrictEqual(reading(99));
    for (const id of ids.filter((other) => other !== 'device-0007')) {
      expect(next.get(id)).toBe(index.get(id));
    }
    expect(changed(index, next)).toStrictEqual(['device-0007']);
  });

  it('returns itself for the same value and counts a new device', () => {
    const same = index.get('device-0001');
    expect(same && index.set('device-0001', same)).toBe(index);
    const added = index.set('fresh', reading(1));
    expect(added.size).toBe(ids.length + 1);
    expect(changed(index, added)).toStrictEqual(['fresh']);
    expect(changed(added, index)).toStrictEqual(['fresh']);
  });

  it('reports nothing for the same index', () => {
    expect(changed(index, index)).toStrictEqual([]);
  });

  it('shares untouched buckets between versions', () => {
    const next = index.set('device-0007', reading(99));
    const touched = changed(index, next).length;
    expect(touched).toBe(1);
  });
});
