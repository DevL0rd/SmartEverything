import { describe, expect, it, vi } from 'vitest';
import { RowVisibility } from './virtual-list-visibility';

describe('RowVisibility', () => {
  it('treats every row as visible until the list reports', () => {
    expect(new RowVisibility().visible('a')).toBe(true);
  });

  it('notifies only rows whose visibility changed', () => {
    const rows = new RowVisibility();
    const a = vi.fn();
    const b = vi.fn();
    rows.subscribe('a', a);
    rows.subscribe('b', b);
    rows.replace(new Set(['a']));
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    expect(rows.visible('b')).toBe(false);
    rows.replace(new Set(['b']));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });
});
