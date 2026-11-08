import { useMemo } from 'react';
import { isVacuumTaskPhase, vacuumPhase, type VacuumTrailRun } from '@smarteverything/domain';
import type { RenderPose, RenderTrailRun } from '../../../../components/house-map/render-scene';
import { deviceValuesOf, type StoreState } from '../../../../store/state';
import { useStoreSelector } from '../../../../store/store-context';
import { deviceModelOf } from '../../model/device-model';
import { valueOrNull } from '../model/readings';
import { vacuumRenderPose } from '../model/vacuum-scene';
import { snapshotOf } from './snapshot';
import { useLiveTrail } from './use-live-trail';
import { useVacuumLivePose } from './use-vacuum-pose';

const NO_BASE: readonly VacuumTrailRun[] = [];

export interface VacuumMapPose {
  readonly robot: RenderPose | null;
  readonly working: boolean;
  readonly trail: readonly RenderTrailRun[];
}

function workingOf(state: StoreState, deviceId: string | null): boolean {
  const device = deviceId === null ? undefined : state.tables.devices.byId[deviceId];
  if (device === undefined) return false;
  const { presentation } = deviceModelOf(device);
  const values = deviceValuesOf(state, device.id);
  return isVacuumTaskPhase(vacuumPhase(snapshotOf(presentation, values, device.online).values));
}

export function useVacuumMapPose(deviceId: string | null): VacuumMapPose | null {
  const id = deviceId ?? '';
  const pose = valueOrNull(useVacuumLivePose(id));
  const trail = useLiveTrail(id, NO_BASE);
  const working = useStoreSelector((state) => workingOf(state, deviceId), Object.is, [deviceId]);
  return useMemo(
    () =>
      deviceId === null
        ? null
        : { robot: vacuumRenderPose(pose), working, trail: [...trail.base, ...trail.live] },
    [deviceId, pose, working, trail],
  );
}
