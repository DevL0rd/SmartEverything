import { useMemo, useState } from 'react';
import type { VacuumTrailRun } from '@smarteverything/domain';
import {
  rebaseLiveTrail,
  shownTrailOf,
  startLiveTrail,
  withLivePose,
  type LiveTrail,
  type ShownTrail,
} from '../model/live-trail';
import { valueOrNull } from '../model/readings';
import type { VacuumLivePose } from './map-feed';
import { useVacuumLivePose } from './use-vacuum-pose';

interface Held {
  readonly pose: VacuumLivePose | null;
  readonly trail: LiveTrail;
}

function advanced(held: Held, base: readonly VacuumTrailRun[], pose: VacuumLivePose | null): Held {
  const rebased = rebaseLiveTrail(held.trail, base);
  return { pose, trail: held.pose === pose ? rebased : withLivePose(rebased, pose) };
}

export function useLiveTrail(deviceId: string, base: readonly VacuumTrailRun[]): ShownTrail {
  const pose = valueOrNull(useVacuumLivePose(deviceId));
  const [held, setHeld] = useState<Held>(() => ({ pose, trail: startLiveTrail(base, pose) }));
  const stale = held.pose !== pose || held.trail.base !== base;
  const current = stale ? advanced(held, base, pose) : held;
  if (stale) setHeld(current);
  return useMemo(() => shownTrailOf(current.trail), [current.trail]);
}
