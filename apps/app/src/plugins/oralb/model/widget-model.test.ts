import { describe, expect, it } from 'vitest';
import { widgetLayoutOf } from './widget-model';

describe('the Oral-B live widget layout', () => {
  it('gives every frame class a wide layout, never a lone ring', () => {
    expect(widgetLayoutOf('m')).toBe('compact');
    expect(widgetLayoutOf('l')).toBe('column');
    expect(widgetLayoutOf('w')).toBe('row');
    expect(widgetLayoutOf('xl')).toBe('report');
  });
});
