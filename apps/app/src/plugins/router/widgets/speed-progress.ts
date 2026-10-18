import type { SpeedTestPhase } from '../router-data';

const MEASURED: readonly SpeedTestPhase[] = ['ping', 'download', 'upload'];

export function phaseShare(phase: SpeedTestPhase | null): number {
  const index = phase === null ? -1 : MEASURED.indexOf(phase);
  return index < 0 ? 0 : (index + 0.5) / MEASURED.length;
}
