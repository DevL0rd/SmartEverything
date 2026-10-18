import { useRef, type RefObject } from 'react';
import type { View } from 'react-native';
import type { ShellyDevice } from '@smarteverything/shelly';
import { useVisibleLive } from '../../design/use-visible-live';
import { useTracked } from './presence-data';
import type { Trail } from './track-trail';
import { useTrackingLease, type TrackingLease } from './use-tracking-lease';
import { useTrackTrail } from './use-track-trail';

export interface LivePresence {
  readonly frame: RefObject<View | null>;
  readonly onLayout: (() => void) | undefined;
  readonly live: boolean;
  readonly lease: TrackingLease;
  readonly sensor: ShellyDevice;
  readonly trail: Trail;
}

export function useLivePresence(base: ShellyDevice): LivePresence {
  const frame = useRef<View>(null);
  const { live, onLayout } = useVisibleLive(frame);
  const lease = useTrackingLease(base, live);
  const sensor = useTracked(base, lease.tracking);
  const trail = useTrackTrail(sensor, lease.tracking);
  return { frame, onLayout, live, lease, sensor, trail };
}
