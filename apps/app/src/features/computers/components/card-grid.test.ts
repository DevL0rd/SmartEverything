import { describe, expect, it } from 'vitest';
import { columnsOfBody } from './card-grid';

describe('computer card grid', () => {
  it('uses one column on a phone and two on a wide body', () => {
    expect(columnsOfBody(390)).toBe(1);
    expect(columnsOfBody(560)).toBe(2);
  });
});
