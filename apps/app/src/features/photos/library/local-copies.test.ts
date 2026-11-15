import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../components/toast-store', () => ({ notify: vi.fn() }));

import { localCopyLine } from './local-copies';

describe('what the toast says about the copy on this device', () => {
  it('names the copies moved to the trash of this phone or computer', () => {
    expect(localCopyLine({ kind: 'done', asked: 1, changed: 1, place: 'phone' }, 'trash')).toBe(
      'The copy on this phone moved to its trash too.',
    );
    expect(localCopyLine({ kind: 'done', asked: 3, changed: 3, place: 'computer' }, 'trash')).toBe(
      'The 3 copies on this computer moved to its trash too.',
    );
    expect(localCopyLine({ kind: 'done', asked: 1, changed: 0, place: 'phone' }, 'trash')).toBe(
      null,
    );
  });

  it('says when the copies stayed on this phone', () => {
    expect(localCopyLine({ kind: 'declined', asked: 2, changed: 0, place: 'phone' }, 'trash')).toBe(
      'The 2 copies on this phone were kept.',
    );
    expect(
      localCopyLine({ kind: 'unsupported', asked: 1, changed: 0, place: 'phone' }, 'trash'),
    ).toBe('This phone has no trash, so its copy was kept.');
  });

  it('says how a restore went, including when the computer cannot restore its trash', () => {
    expect(localCopyLine({ kind: 'done', asked: 1, changed: 1, place: 'phone' }, 'restore')).toBe(
      'The copy on this phone is back too.',
    );
    expect(localCopyLine({ kind: 'done', asked: 2, changed: 1, place: 'phone' }, 'restore')).toBe(
      '1 of the 2 copies on this phone are back. The others had already left its trash.',
    );
    expect(localCopyLine({ kind: 'done', asked: 1, changed: 0, place: 'phone' }, 'restore')).toBe(
      'The copy on this phone had already left its trash, so it is only on the hub.',
    );
    expect(
      localCopyLine({ kind: 'declined', asked: 1, changed: 0, place: 'phone' }, 'restore'),
    ).toBe('The copy on this phone stays in its trash.');
    expect(
      localCopyLine({ kind: 'unsupported', asked: 2, changed: 0, place: 'computer' }, 'restore'),
    ).toBe('The 2 copies on this computer stay in its trash. Restore them from there.');
  });

  it('says nothing for items that exist only on the hub', () => {
    expect(localCopyLine({ kind: 'none' }, 'trash')).toBeNull();
    expect(localCopyLine({ kind: 'none' }, 'restore')).toBeNull();
  });
});
