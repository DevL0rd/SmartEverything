import { useEffect } from 'react';
import { API_ENDPOINTS as E, type HistorySourceClass } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { api } from '../api/transport';
import { RING_SPAN_MS, computerRings } from './computer-rings';

const BACKFILL_TOPICS = ['summary', 'cpu', 'gpu', 'memory', 'disks', 'network', 'power'];
const BACKFILL_POINTS = 400;

async function backfill(
  deviceId: string,
  source: HistorySourceClass,
  topics: readonly string[],
): Promise<void> {
  const response = await api().call(E.readHistoryBackfill, {
    body: {
      device: deviceId,
      source,
      topics: [...topics],
      maxPoints: BACKFILL_POINTS,
      windowMs: RING_SPAN_MS,
    },
  });
  computerRings.seed(deviceId, response);
}

export function useRingBackfill(
  deviceId: string,
  source: HistorySourceClass,
  topics: readonly string[] = BACKFILL_TOPICS,
): void {
  useEffect(() => {
    const fresh = computerRings.claimBackfill(deviceId, topics);
    if (fresh.length === 0) return;
    background(
      backfill(deviceId, source, fresh).catch((error: unknown) => {
        computerRings.releaseBackfill(deviceId, fresh);
        throw error;
      }),
      'computer.backfill_failed',
    );
  }, [deviceId, source, topics]);
}
