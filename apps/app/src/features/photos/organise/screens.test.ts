import { describe, expect, it } from 'vitest';
import { ArchiveScreen, LockedScreen, MetaEditHost } from './index';

describe('organise screens', () => {
  it('load the screens the routes show', () => {
    expect(typeof ArchiveScreen).toBe('function');
    expect(typeof LockedScreen).toBe('function');
    expect(typeof MetaEditHost).toBe('function');
  });
});
