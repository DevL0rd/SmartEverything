import { describe, expect, it } from 'vitest';
import { columnsOfArea } from './card-grid';

describe('computer card grid', () => {
  it('uses one column on a phone and two on a wide body', () => {
    expect(columnsOfArea(390)).toBe(1);
    expect(columnsOfArea(1400)).toBe(2);
  });
});
