import { MODEL_SPEC, shownParts, type ModelSpec } from '@smarteverything/domain';
import { XIAOMI_WIRELESS_SWITCH_ROUND_MODEL as SWITCH } from '@smarteverything/xiaomi';
import { describe, expect, it } from 'vitest';
import { MODEL_REGISTRY, checkAuthoring } from '../../../src/index';

function channel(id: string): NonNullable<ModelSpec['channels']>[number] {
  const found = SWITCH.channels?.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no channel ${id}`);
  return found;
}

describe('the round Xiaomi Mi Wireless Switch (WXKG01LM)', () => {
  it('parses strictly, passes every authoring check and is registered', () => {
    expect(MODEL_SPEC.safeParse(SWITCH).success).toBe(true);
    expect(checkAuthoring(SWITCH).problems).toStrictEqual([]);
    expect(MODEL_REGISTRY.map((spec) => spec.id)).toContain('dev.button.xiaomi-wireless-round');
  });

  it('is a 50 mm disc 13 mm deep that faces out from the wall', () => {
    expect(SWITCH.footprint).toStrictEqual({ width: 0.05, depth: 0.013, height: 0.05 });
    expect(SWITCH.anchors?.find((anchor) => anchor.kind === 'mount')).toMatchObject({
      mount: 'wall',
    });
  });

  it('presses the cap in for every press kind and rests it when released', () => {
    const { map } = channel('capPress');
    if (map.type !== 'enum') throw new Error('capPress is not an enum map');

    expect(map.table['none']).toBe(0);
    for (const kind of ['single', 'double', 'long']) expect(map.table[kind]).toBeLessThan(0);
  });

  it('keeps the silhouette whole at tile size and the LED from card size', () => {
    const tile = shownParts(SWITCH, 0, {}).map((part) => part.id);
    const card = shownParts(SWITCH, 1, {}).map((part) => part.id);

    expect(tile).toStrictEqual(['shell', 'cap']);
    expect(card).toContain('led');
  });

  it('is still when idle: no shot and no press pose', () => {
    expect(SWITCH.shots).toBeUndefined();
    expect(SWITCH.states?.['idle']?.['pressed']).toBe('none');
  });
});
