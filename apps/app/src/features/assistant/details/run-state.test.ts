import { describe, expect, it } from 'vitest';
import { isActiveRun, quietHint, runStateLabel, runSummary } from './run-state';

describe('agent run state', () => {
  it('counts queued, running, waiting and stopping runs as active', () => {
    expect(isActiveRun({ state: 'running' })).toBe(true);
    expect(isActiveRun({ state: 'queued' })).toBe(true);
    expect(isActiveRun({ state: 'completed' })).toBe(false);
    expect(isActiveRun({ state: 'failed' })).toBe(false);
  });

  it('keeps the last known state visible when the state is unknown', () => {
    expect(runStateLabel({ state: 'unknown', last_known_state: 'running' })).toBe(
      'Unknown · last known running',
    );
    expect(runStateLabel({ state: 'unknown', last_known_state: null })).toBe('Unknown');
  });

  it('appends progress to the state when there is some', () => {
    const run = {
      state: 'running',
      last_known_state: null,
      updated_at: '2026-10-25T10:00:00.000Z',
    } as const;
    const now = Date.parse('2026-10-25T10:00:30.000Z');
    expect(runSummary({ ...run, progress: 'Read the release notes · step 3 of 5' }, now)).toBe(
      'Running · Read the release notes · step 3 of 5',
    );
    expect(runSummary({ ...run, progress: '  ' }, now)).toBe('Running');
    expect(runSummary({ ...run, progress: null }, now)).toBe('Running');
  });

  it('says how long an active run has been silent, for display only', () => {
    const run = { state: 'running', updated_at: '2026-10-25T10:00:00.000Z' } as const;
    const at = (seconds: number): number => Date.parse('2026-10-25T10:00:00.000Z') + seconds * 1000;

    expect(quietHint(run, at(59))).toBeNull();
    expect(quietHint(run, at(60))).toBe('No activity for 1 min');
    expect(quietHint(run, at(5 * 3600 + 120))).toBe('No activity for 5 h 2 min');
    expect(quietHint({ ...run, state: 'completed' }, at(3600))).toBeNull();
    expect(runSummary({ ...run, last_known_state: null, progress: 'Reading' }, at(180))).toBe(
      'Running · Reading · No activity for 3 min',
    );
  });
});
