import { ApiError } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { NO_ABILITIES } from '../source/abilities';
import { COMPUTER_FULL } from '../source/fixture-seeds';
import { bodyStateOf, emptyCopyOf, type BodyInput } from './view-state-model';

const base: BodyInput = {
  abilities: COMPUTER_FULL,
  loading: false,
  error: null,
  offline: false,
  loaded: 4,
  visible: 4,
  filtering: false,
  search: 'unasked',
  kind: 'all',
};

describe('browser body state', () => {
  it('refuses a place the viewer cannot list', () => {
    expect(bodyStateOf({ ...base, abilities: NO_ABILITIES }).kind).toBe('refused');
  });

  it('shows the loading skeleton before anything arrived', () => {
    expect(bodyStateOf({ ...base, loaded: 0, visible: 0, loading: true }).kind).toBe('loading');
  });

  it('tells a private folder apart from a failure', () => {
    const denied = new ApiError('forbidden', 'No');
    expect(bodyStateOf({ ...base, loaded: 0, visible: 0, error: denied }).kind).toBe('denied');
    expect(bodyStateOf({ ...base, loaded: 0, visible: 0, error: new Error('x') }).kind).toBe(
      'failed',
    );
  });

  it('shows the offline state for an empty listing while offline', () => {
    expect(bodyStateOf({ ...base, loaded: 0, visible: 0, offline: true }).kind).toBe('offline');
  });

  it('keeps showing the cached entries while offline', () => {
    expect(bodyStateOf({ ...base, offline: true }).kind).toBe('entries');
  });

  it('separates an empty folder, an empty kind and a filter with no match', () => {
    expect(bodyStateOf({ ...base, loaded: 0, visible: 0 }).kind).toBe('empty');
    expect(bodyStateOf({ ...base, visible: 0, kind: 'image' }).kind).toBe('kindEmpty');
    expect(bodyStateOf({ ...base, visible: 0, filtering: true, search: 'done' }).kind).toBe(
      'noMatch',
    );
    expect(bodyStateOf({ ...base, visible: 0, filtering: true, search: 'looking' }).kind).toBe(
      'searching',
    );
  });
});

describe('empty copy', () => {
  it('words Trash, hidden-only and plain folders', () => {
    expect(emptyCopyOf(true, true, false).title).toBe('Trash is empty');
    expect(emptyCopyOf(false, true, true).title).toBe('Only hidden items here');
    expect(emptyCopyOf(false, true, false).body).toBe('Upload files or drop them here.');
    expect(emptyCopyOf(false, false, false).body).toBe('Nothing has been added here yet.');
  });
});
