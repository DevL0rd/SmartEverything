import { useState } from 'react';
import type { ShellyDevice } from '@smarteverything/shelly';
import { useMotion } from '../../design/motion';
import { advanceTrail, NO_TRAIL, type Trail, type TrailState } from './track-trail';

export function useTrackTrail(sensor: ShellyDevice, tracking: boolean): Trail {
  const { reduced } = useMotion();
  const [state, setState] = useState<TrailState>({
    at: sensor.tracksAt,
    shown: sensor.tracks,
    trail: NO_TRAIL,
  });
  const next = advanceTrail(
    state,
    { at: sensor.tracksAt, tracks: sensor.tracks },
    tracking && !reduced,
  );
  if (next !== state) setState(next);
  return next.trail;
}
