import { describe, expect, it } from 'vitest';
import { savedFoodByBarcode } from './barcode';

const FOODS = [
  { id: 'a', barcode: null },
  { id: 'b', barcode: '5000112637922' },
];

describe('a scanned barcode', () => {
  it('finds the food the person already saved with that barcode', () => {
    expect(savedFoodByBarcode(FOODS, '5000112637922')?.id).toBe('b');
  });

  it('finds nothing for a barcode no saved food carries', () => {
    expect(savedFoodByBarcode(FOODS, '5000112637923')).toBeNull();
  });
});
