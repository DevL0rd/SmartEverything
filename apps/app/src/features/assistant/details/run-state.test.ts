import { describe, expect, it } from 'vitest';
import { isActiveRun, runStateLabel, runSummary } from './run-state';

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
    const run = { state: 'running', last_known_state: null } as const;
    expect(runSummary({ ...run, progress: 'Read the release notes · step 3 of 5' })).toBe(
      'Running · Read the release notes · step 3 of 5',
    );
    expect(runSummary({ ...run, progress: '  ' })).toBe('Running');
    expect(runSummary({ ...run, progress: null })).toBe('Running');
  });
});
