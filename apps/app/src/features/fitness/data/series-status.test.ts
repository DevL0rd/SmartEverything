import { describe, expect, it, vi } from 'vitest';
import { statusOf } from './series';

vi.mock('./reads', () => ({}));

const PENDING = { isPending: true, error: null };
const DONE = { isPending: false, error: null };
const FAILED = { isPending: false, error: new Error('records failed') };

describe('series loading and problem', () => {
  it('shows a daily-sourced chart as soon as the daily figures arrive, whatever the list records do', () => {
    expect(statusOf(false, DONE, PENDING)).toEqual({ loading: false, problem: null });
    expect(statusOf(false, DONE, FAILED)).toEqual({ loading: false, problem: null });
  });

  it('waits on and reports the daily figures for a daily-sourced chart', () => {
    expect(statusOf(false, PENDING, DONE).loading).toBe(true);
    expect(statusOf(false, { isPending: false, error: new Error('daily failed') }, DONE)).toEqual({
      loading: false,
      problem: 'daily failed',
    });
  });

  it('waits on and reports the records for a records-sourced chart', () => {
    expect(statusOf(true, DONE, PENDING).loading).toBe(true);
    expect(statusOf(true, DONE, FAILED)).toEqual({ loading: false, problem: 'records failed' });
  });
});
