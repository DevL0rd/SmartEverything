import { useEffect } from 'react';
import { historyClassOf } from '@smarteverything/domain';
import { useStableCallback } from '../../design/use-stable-callback';
import { useRingBackfill } from '../../store/computer-backfill';
import { computerRings, type ComputerRings } from '../../store/computer-rings';
import { seriesId, type SeriesReading } from '../../store/computer-series';
import { useLiveDemand } from '../../store/use-live-demand';
import type { Device } from '../../store/state';

const SOURCE_TOPIC = 'live';

const SOURCE_TOPICS = [SOURCE_TOPIC] as const;
const BACKFILL_SOURCE_TOPICS: readonly string[] = SOURCE_TOPICS;

export function liveSeriesId(key: string): string {
  return seriesId(SOURCE_TOPIC, key);
}

export function feedReadings(
  rings: ComputerRings,
  deviceId: string,
  at: number,
  readings: readonly SeriesReading[],
): void {
  for (const [id, value] of readings) {
    if (value !== null) rings.ring(deviceId, id).push(at, value);
  }
}

export function useSourceLive<T extends { readonly at: string }>(
  device: Device,
  snapshot: T,
  readingsOf: (snapshot: T) => readonly SeriesReading[],
): void {
  useLiveDemand(device.id, SOURCE_TOPICS);
  useRingBackfill(device.id, historyClassOf(device), BACKFILL_SOURCE_TOPICS);
  const readings = useStableCallback(readingsOf);
  useEffect(() => {
    feedReadings(computerRings, device.id, Date.parse(snapshot.at), readings(snapshot));
  }, [snapshot, device.id, readings]);
}
