import { describe, expect, it } from 'vitest';
import { passed, renderResults, totals, type CaseResult } from './recovery-results.ts';

const GOOD: CaseResult = {
  name: 'big/kill-helper/plain',
  runs: 3,
  passes: 3,
  failure: null,
  seconds: 41.6,
  notes: [],
};
const BAD: CaseResult = {
  name: 'batch/cut-60s/plain',
  runs: 3,
  passes: 1,
  failure: 'run 2: 1 lost',
  seconds: 200,
  notes: ['one note'],
};

describe('results', () => {
  it('counts a case as passed only when every run passed', () => {
    expect(passed(GOOD)).toBe(true);
    expect(passed(BAD)).toBe(false);
    expect(passed({ ...GOOD, passes: 2 })).toBe(false);
    expect(totals([GOOD, BAD])).toEqual({ pass: 1, fail: 1 });
  });

  it('renders the command, the counts, the failures and the notes', () => {
    const text = renderResults({
      suite: 'crash',
      command: 'rig crash --repeat 3',
      startedAt: '2026-11-15T01:02:03.000Z',
      cases: [GOOD, BAD],
    });
    expect(text).toContain('Command: `rig crash --repeat 3`');
    expect(text).toContain('Cases: 2 · pass 1 · fail 1 · not run 0');
    expect(text).toContain('| big/kill-helper/plain | 3 of 3 | 42 | pass |');
    expect(text).toContain('| batch/cut-60s/plain | 1 of 3 | 200 | FAIL |');
    expect(text).toContain('run 2: 1 lost');
    expect(text).toContain('- batch/cut-60s/plain: one note');
  });
});
