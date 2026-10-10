import { useEffect, useState } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type {
  DesktopFfmpeg,
  DesktopServiceLogs,
  DesktopServiceStatus,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { DesktopBridge } from '../design/platform';
import { FFMPEG_KEY, SERVICE_LOG_TAIL_KEY } from '../queries/keys';
import { rawErrorText } from '../format/errors';

const log = new Logger('app.desktop-service');

export type ServiceReading =
  | { readonly kind: 'reading' }
  | { readonly kind: 'read'; readonly status: DesktopServiceStatus }
  | { readonly kind: 'failed'; readonly problem: string };

export function useServiceStatus(bridge: DesktopBridge): {
  readonly reading: ServiceReading;
  readonly apply: (next: DesktopServiceStatus) => void;
} {
  const [reading, setReading] = useState<ServiceReading>({ kind: 'reading' });
  useEffect(() => {
    const stop = bridge.onServiceStatus((status) => {
      setReading({ kind: 'read', status });
    });
    bridge.serviceStatus().then(
      (status) => {
        setReading({ kind: 'read', status });
      },
      (error: unknown) => {
        log.error('service.status_unreadable', error);
        setReading({
          kind: 'failed',
          problem: rawErrorText(error),
        });
      },
    );
    return stop;
  }, [bridge]);
  return {
    reading,
    apply: (status): void => {
      setReading({ kind: 'read', status });
    },
  };
}

export function useFfmpeg(bridge: DesktopBridge): UseQueryResult<DesktopFfmpeg> {
  return useQuery({ queryKey: FFMPEG_KEY, queryFn: () => bridge.checkFfmpeg() });
}

export function useServiceLogTail(bridge: DesktopBridge): UseQueryResult<DesktopServiceLogs> {
  return useQuery({ queryKey: SERVICE_LOG_TAIL_KEY, queryFn: () => bridge.serviceLogs() });
}
