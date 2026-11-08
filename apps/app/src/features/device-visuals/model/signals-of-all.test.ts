import { DEVICE_FAMILIES, MODEL_SIGNAL_SET } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { FAMILY_SIGNALS, signalsOf } from './signals-of';
import { ON, sample } from './signals-of-fixtures';

describe('every device family', () => {
  it.each(DEVICE_FAMILIES)('%s turns a bare state into valid signals', (family) => {
    const signals = signalsOf(family, sample({}));
    expect(MODEL_SIGNAL_SET.safeParse(signals).success).toBe(true);
    expect(signals).toMatchObject(ON);
  });

  it('registers only families that exist', () => {
    for (const family of Object.keys(FAMILY_SIGNALS)) {
      expect(DEVICE_FAMILIES).toContain(family);
    }
  });
});
