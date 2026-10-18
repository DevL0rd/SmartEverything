import { describe, expect, it } from 'vitest';
import { viewerClasses } from './viewer-layout';

describe('viewerClasses', () => {
  it('keeps one slot per region in every layout so only styles change', () => {
    const keys = Object.keys(viewerClasses({ wide: false, columns: false })).sort();
    expect(Object.keys(viewerClasses({ wide: true, columns: true })).sort()).toEqual(keys);
    expect(Object.keys(viewerClasses({ wide: false, columns: true })).sort()).toEqual(keys);
  });

  it('puts the inspector beside the player only when wide', () => {
    expect(viewerClasses({ wide: true, columns: true }).row).toContain('flex-row');
    expect(viewerClasses({ wide: false, columns: true }).row).not.toContain('flex-row');
    expect(viewerClasses({ wide: true, columns: true }).width).toBe('dashboard');
    expect(viewerClasses({ wide: false, columns: false }).width).toBe('detail');
  });

  it('splits panels and recent into columns only at the expanded width', () => {
    expect(viewerClasses({ wide: false, columns: true }).side).toContain('flex-row');
    expect(viewerClasses({ wide: false, columns: false }).side).not.toContain('flex-row');
  });
});
