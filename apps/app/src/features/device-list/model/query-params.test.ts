import { describe, expect, it } from 'vitest';
import { ANY } from './device-filter';
import { BLANK_QUERY, withParams } from './query-params';

describe('device list address params', () => {
  it('takes the room and the offline status from the address', () => {
    expect(withParams(BLANK_QUERY, { room: 'kitchen', status: 'offline' })).toEqual({
      ...BLANK_QUERY,
      room: 'kitchen',
      offline: true,
    });
  });

  it('keeps the search text and kind and returns the same query when nothing changed', () => {
    const query = { ...BLANK_QUERY, text: 'lamp', room: 'hall' };
    expect(withParams(query, { room: 'hall' })).toBe(query);
    expect(withParams(query, {})).toEqual({ ...query, room: ANY });
    expect(withParams(query, { room: '' }).room).toBe(ANY);
  });

  it('takes the selected device from the address and drops an empty one', () => {
    expect(withParams(BLANK_QUERY, { device: 'lamp' }).device).toBe('lamp');
    expect(withParams(BLANK_QUERY, { device: '' })).toBe(BLANK_QUERY);
    const picked = { ...BLANK_QUERY, device: 'lamp' };
    expect(withParams(picked, {}).device).toBeUndefined();
  });
});
