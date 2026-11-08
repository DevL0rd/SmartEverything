import { useMemo } from 'react';
import { VACUUM_POSE_KEY, type VacuumPose } from '@smarteverything/domain';
import { useDeviceValue } from '../../../../store/selectors';
import { readingOf, type Reading } from '../model/readings';
import { parseLivePose, parsePose, type VacuumLivePose } from './map-feed';

export function useVacuumPose(deviceId: string): Reading<VacuumPose | null> {
  const text = useDeviceValue(deviceId, VACUUM_POSE_KEY)?.value;
  return useMemo(() => readingOf(() => parsePose(text)), [text]);
}

export function useVacuumLivePose(deviceId: string): Reading<VacuumLivePose | null> {
  const text = useDeviceValue(deviceId, VACUUM_POSE_KEY)?.value;
  return useMemo(() => readingOf(() => parseLivePose(text)), [text]);
}
