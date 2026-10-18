import { DEVELOPER_TOGGLES, resolveFlags, type DeveloperFlagId, type StoredFlags } from './toggles';

export type ProfilingState = 'on' | 'off' | 'mixed';

export const PROFILING_IDS: readonly DeveloperFlagId[] = DEVELOPER_TOGGLES.filter(
  (toggle) => toggle.section === 'Performance',
).map((toggle) => toggle.id);

export function profilingOnCount(stored: StoredFlags, development: boolean): number {
  const flags = resolveFlags(stored, development);
  return PROFILING_IDS.filter((id) => flags[id]).length;
}

export function profilingState(stored: StoredFlags, development: boolean): ProfilingState {
  const on = profilingOnCount(stored, development);
  if (on === 0) {
    return 'off';
  }
  return on === PROFILING_IDS.length ? 'on' : 'mixed';
}

export function withAllProfiling(stored: StoredFlags, on: boolean): StoredFlags {
  return { ...stored, ...Object.fromEntries(PROFILING_IDS.map((id) => [id, on])) };
}
