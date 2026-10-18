import { useRef } from 'react';
import {
  API_ENDPOINTS as E,
  type ComputerDetail,
  type ComputerParts,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { usePausable } from '../../../design/external-store';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { sameJson } from '../../../store/same-json';
import { computerLive } from '../../../store/computer-live';
import { computerRings } from '../../../store/computer-rings';
import type { Device } from '../../../store/state';
import { useLastSeen } from '../../devices';
import {
  BUSY_PERCENT,
  BUSY_SPAN_MS,
  hottestOf,
  statusOf,
  sustainedAbove,
  type ComputerStatus,
} from '../model/computer-view';

export function useComputerDetail(
  deviceId: string,
  enabled: boolean,
): ReturnType<typeof useScreenQuery<ComputerDetail>> {
  return useScreenQuery({
    queryKey: ['window', 'computer-detail', deviceId],
    queryFn: () => api().call(E.readComputer, { params: { deviceId } }),
    enabled,
  });
}

export function useComputerSelect<T>(
  deviceId: string,
  select: (parts: ComputerParts) => T,
  equal: (left: T, right: T) => boolean = Object.is,
): T {
  const store = computerLive.store(deviceId);
  const last = useRef<{ readonly value: T } | null>(null);
  return usePausable(store.subscribe, () => {
    const next = select(store.get().parts);
    if (last.current !== null && equal(last.current.value, next)) return last.current.value;
    last.current = { value: next };
    return next;
  });
}

export function useComputerStatus(device: Device): ComputerStatus {
  const seen = useLastSeen(device.id)?.at ?? null;
  const { id, online } = device;
  return useComputerSelect(
    id,
    (parts) =>
      statusOf({
        online,
        seenAt: seen,
        locked: parts.session?.locked ?? null,
        hottest: hottestOf(parts.summary),
        throttled: parts.cpu?.throttled ?? null,
        busy: sustainedAbove(
          computerRings.ring(id, 'summary/cpuLoad').points(),
          BUSY_PERCENT,
          BUSY_SPAN_MS,
        ),
        battery: parts.system?.battery ?? null,
      }),
    sameJson,
  );
}
