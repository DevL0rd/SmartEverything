import { DEVICE_FAMILIES } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { LaundryFace } from '../laundry/faces';
import { TelevisionFace } from '../television/faces';
import { FAMILY_CARDS } from './family-cards';
import { LightCardFace } from './light-card-face';

const OWNED_BY_RICHNESS_SLICES = [
  'button',
  'switch',
  'plug',
  'scale',
  'wearable',
  'diffuser',
  'ir_blaster',
  'ir_remote',
  'sensor',
  'air_purifier',
  'humidifier',
  'microwave',
] as const;

describe('the face of each device family on a Devices cell', () => {
  it('only names real device families', () => {
    for (const family of Object.keys(FAMILY_CARDS)) {
      expect(DEVICE_FAMILIES).toContain(family);
    }
  });

  it('keeps light, laundry and television on their own faces', () => {
    expect(FAMILY_CARDS.light).toBe(LightCardFace);
    expect(FAMILY_CARDS.laundry).toBe(LaundryFace);
    expect(FAMILY_CARDS.television).toBe(TelevisionFace);
  });

  it('has an entry for every family a richness slice fills in', () => {
    for (const family of OWNED_BY_RICHNESS_SLICES) {
      expect(FAMILY_CARDS[family], family).toBeTypeOf('function');
    }
  });

  it('leaves the computer to its own registry', () => {
    expect(FAMILY_CARDS.computer).toBeUndefined();
  });
});
