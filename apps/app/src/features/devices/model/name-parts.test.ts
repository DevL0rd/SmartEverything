import { describe, expect, it } from 'vitest';
import { nameParts } from './name-parts';

describe('nameParts', () => {
  it('keeps the last word apart so numbered lights stay different when the name is cut', () => {
    expect(nameParts('Ceiling light 1')).toEqual({ head: 'Ceiling light', tail: ' 1' });
    expect(nameParts('Ceiling light 2')).toEqual({ head: 'Ceiling light', tail: ' 2' });
    expect(nameParts('House light 21').tail).toBe(' 21');
  });

  it('keeps the distinguishing end of long names', () => {
    expect(nameParts('Walk-in wardrobe mirror').tail).toBe(' mirror');
    expect(nameParts('Walk-in wardrobe light').tail).toBe(' light');
  });

  it('leaves a single word whole', () => {
    expect(nameParts('Kitchen')).toEqual({ head: 'Kitchen', tail: '' });
  });

  it('leaves a name that ends in a space whole', () => {
    expect(nameParts('Hall ')).toEqual({ head: 'Hall ', tail: '' });
  });
});
