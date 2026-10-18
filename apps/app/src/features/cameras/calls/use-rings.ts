import { useCallback, useEffect, useRef, useState } from 'react';
import { Logger } from '@smarteverything/logging';
import { rowsOf } from '../../../store/state';
import { useEntityStore } from '../../../store/store-context';
import { RING_FOR_MS, newRings, type Ring } from '../logic/ringing';

const log = new Logger('app.cameras');

export interface Rings {
  readonly ring: Ring | null;
  readonly dismiss: (eventId: string) => void;
}

function useRingQueue(
  cameraIds: ReadonlySet<string>,
): readonly [readonly Ring[], (eventId: string) => void] {
  const store = useEntityStore();
  const [rings, setRings] = useState<readonly Ring[]>([]);
  const cameras = useRef(cameraIds);
  useEffect(() => {
    cameras.current = cameraIds;
  }, [cameraIds]);
  useEffect(() => {
    const seen = new Set(store.get().tables.events.ids);
    let table = store.get().tables.events;
    return store.subscribe(() => {
      const next = store.get().tables.events;
      if (next === table) {
        return;
      }
      table = next;
      const fresh = newRings(rowsOf(next), seen, cameras.current, Date.now());
      for (const id of next.ids) {
        seen.add(id);
      }
      if (fresh.length > 0) {
        log.info('ring.detected', {
          count: fresh.length,
          eventIds: fresh.map((ring) => ring.eventId).join(','),
          kinds: fresh.map((ring) => ring.kind).join(','),
        });
        setRings((current) => [...current, ...fresh]);
      }
    });
  }, [store]);
  const dismiss = useCallback((eventId: string): void => {
    log.debug('ring.dismissed', { eventId });
    setRings((current) => current.filter((ring) => ring.eventId !== eventId));
  }, []);
  return [rings, dismiss];
}

export function useRings(cameraIds: ReadonlySet<string>): Rings {
  const [rings, dismiss] = useRingQueue(cameraIds);
  const ring = rings[0] ?? null;
  useEffect(() => {
    if (ring === null) {
      return undefined;
    }
    const left = Date.parse(ring.occurredAt) + RING_FOR_MS - Date.now();
    const timer = setTimeout(
      () => {
        log.info('ring.expired', { eventId: ring.eventId, deviceId: ring.deviceId });
        dismiss(ring.eventId);
      },
      Math.max(0, left),
    );
    return (): void => {
      clearTimeout(timer);
    };
  }, [ring, dismiss]);
  return { ring, dismiss };
}
