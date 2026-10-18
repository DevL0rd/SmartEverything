import type { RouterSnapshot } from '@smarteverything/domain';
import type { SeriesReading } from '../../../store/computer-series';
import { liveSeriesId } from '../../shared/use-source-live';

const BITS_PER_BYTE = 8;
const BITS_PER_MEGABIT = 1_000_000;

export const ROUTER_DOWNLOAD = liveSeriesId('download_rate');
export const ROUTER_UPLOAD = liveSeriesId('upload_rate');

function bytesPerSecond(megabits: number): number {
  return Math.round((megabits * BITS_PER_MEGABIT) / BITS_PER_BYTE);
}

function networkReadings(network: RouterSnapshot['network']): readonly SeriesReading[] {
  return [
    [ROUTER_DOWNLOAD, network === null ? null : bytesPerSecond(network.downloadMbps)],
    [ROUTER_UPLOAD, network === null ? null : bytesPerSecond(network.uploadMbps)],
    [liveSeriesId('latency'), network?.latencyMs ?? null],
  ];
}

function systemReadings(system: RouterSnapshot['system']): readonly SeriesReading[] {
  return [
    [liveSeriesId('cpu_load'), system?.cpuPercent ?? null],
    [liveSeriesId('memory_used'), system?.memoryUsedPercent ?? null],
    [liveSeriesId('temperature'), system?.temperatureCelsius ?? null],
  ];
}

export function routerReadings(snapshot: RouterSnapshot): readonly SeriesReading[] {
  if (snapshot.connection.state !== 'online') {
    return [];
  }
  return [...networkReadings(snapshot.network), ...systemReadings(snapshot.system)];
}
