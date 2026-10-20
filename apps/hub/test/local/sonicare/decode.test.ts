import { fullOf, KEY } from '@smarteverything/ble';
import { describe, expect, it } from 'vitest';
import { BrushDecoder } from '../../../src/local/sonicare/decode';

const AT = '2026-10-18T08:00:00.000Z';

describe('BrushDecoder unreadable frames', () => {
  it('reports a frame too short for its characteristic as unreadable', () => {
    const decoder = new BrushDecoder(false);
    const [item] = decoder.decode({ at: AT, characteristic: fullOf(KEY.handleState), hex: '' });
    expect(item).toMatchObject({ kind: 'unreadable', hex: '' });
  });

  it('decodes a well formed handle state frame', () => {
    const decoder = new BrushDecoder(false);
    const [item] = decoder.decode({ at: AT, characteristic: fullOf(KEY.handleState), hex: '02' });
    expect(item?.kind).toBe('delta');
  });
});
