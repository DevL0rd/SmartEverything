import { describe, expect, it } from 'vitest';
import {
  PROFILING_IDS,
  profilingOnCount,
  profilingState,
  withAllProfiling,
} from './profiling-master';
import { DEVELOPER_TOGGLES, resolveFlags } from './toggles';

const ALL_OFF = Object.fromEntries(PROFILING_IDS.map((id) => [id, false]));

describe('enable all profiling', () => {
  it('covers every performance toggle and nothing else', () => {
    const performance = DEVELOPER_TOGGLES.filter((toggle) => toggle.section === 'Performance');
    expect(PROFILING_IDS).toEqual(performance.map((toggle) => toggle.id));
    expect(PROFILING_IDS).not.toContain('watch.capture');
    expect(PROFILING_IDS.every((id) => id.startsWith('perf.'))).toBe(true);
  });

  it('is off when every option is off', () => {
    expect(profilingState(ALL_OFF, true)).toBe('off');
    expect(profilingOnCount(ALL_OFF, true)).toBe(0);
  });

  it('is mixed with the default frame sampler on and nothing else', () => {
    expect(profilingState({}, true)).toBe('mixed');
    expect(profilingOnCount({}, true)).toBe(1);
  });

  it('turns every option on, including children of sampling, and back off', () => {
    const on = withAllProfiling({}, true);
    expect(profilingState(on, true)).toBe('on');
    const flags = resolveFlags(on, true);
    PROFILING_IDS.forEach((id) => {
      expect(flags[id]).toBe(true);
    });
    expect(profilingState(withAllProfiling(on, false), true)).toBe('off');
  });

  it('leaves the log level and the watch opt-in as they were', () => {
    const stored = { 'log.level.trace': true, 'watch.capture': false, 'perf.gc': true };
    const next = withAllProfiling(stored, true);
    expect(next['log.level.trace']).toBe(true);
    expect(next['watch.capture']).toBe(false);
    expect(next['perf.gc']).toBe(true);
  });

  it('is mixed when a child is on while its parent is off', () => {
    const stored = { ...ALL_OFF, 'perf.gc': true };
    expect(profilingState(stored, true)).toBe('mixed');
    expect(profilingOnCount({ ...ALL_OFF, 'perf.stalls': true }, true)).toBe(0);
  });

  it('is off in a release build with developer mode off', () => {
    expect(profilingState(withAllProfiling({}, true), false)).toBe('off');
  });

  it('runs in a release build once developer mode is on', () => {
    expect(profilingState(withAllProfiling({}, true), true)).toBe('on');
  });
});
