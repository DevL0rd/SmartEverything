import type { ComputerMetric } from '@smarteverything/domain';
import { useDeviceDerived } from '../../../store/selectors';
import { headlineOf, sameHeadline, type Headline } from '../model/computer-headlines';
import { useComputerSelect } from './computer-metrics';

export function useHeadline(deviceId: string, metric: ComputerMetric): Headline | null {
  return useDeviceDerived(deviceId, (values) => headlineOf(values, metric), [metric], sameHeadline);
}

export function useHasGpu(deviceId: string, offline: boolean): boolean {
  const live = useComputerSelect(deviceId, (parts) => (parts.summary?.gpuLoad ?? null) !== null);
  const held = useHeadline(deviceId, 'gpu_load');
  return offline ? held !== null : live;
}
