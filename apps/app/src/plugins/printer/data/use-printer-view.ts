import { PRINTER_KEYS } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useCallback } from 'react';
import { notify } from '../../../components/toast-store';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { useDeviceDerived } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import {
  actOnPrinter,
  readPrinterView,
  type ViewName,
  type ViewOf,
  type ViewQuery,
} from './printer-api';
import type { PrinterActionInput } from '@smarteverything/domain';

const WATCHED_KEYS = [
  PRINTER_KEYS.state,
  PRINTER_KEYS.queuedJobs,
  PRINTER_KEYS.pagesToday,
  PRINTER_KEYS.problem,
  PRINTER_KEYS.queue,
  PRINTER_KEYS.jobProgress,
] as const;

function revisionOf(
  values: Readonly<Record<string, { readonly value: unknown } | undefined>>,
): string {
  return WATCHED_KEYS.map((key) => JSON.stringify(values[key]?.value ?? null)).join('|');
}

export function printerPrefix(deviceId: string): readonly ['window', 'printer', string] {
  return ['window', 'printer', deviceId];
}

export function usePrinterRevision(deviceId: string): string {
  return useDeviceDerived(deviceId, revisionOf, [], Object.is);
}

export function usePrinterView<K extends ViewName>(
  device: Device | null,
  view: K,
  query: ViewQuery = {},
  enabled = true,
): UseQueryResult<ViewOf<K>> {
  const revision = usePrinterRevision(device?.id ?? '');
  return useScreenQuery({
    queryKey: [...printerPrefix(device?.id ?? 'none'), view, query, revision],
    queryFn: () => readPrinterView(device?.external_id ?? null, view, query),
    enabled: enabled && device !== null,
    staleTime: Infinity,
  });
}

export interface PrinterActor {
  readonly act: (
    input: PrinterActionInput,
    failure: string,
  ) => Promise<Readonly<Record<string, unknown>> | null>;
  readonly fire: (input: PrinterActionInput, failure: string) => void;
  readonly throwing: (input: PrinterActionInput) => Promise<Readonly<Record<string, unknown>>>;
}

export function usePrinterActor(device: Device | null): PrinterActor {
  const client = useQueryClient();
  const throwing = useCallback(
    async (input: PrinterActionInput) => {
      const reply = await actOnPrinter(input);
      if (device !== null) await client.invalidateQueries({ queryKey: printerPrefix(device.id) });
      return reply;
    },
    [client, device],
  );
  const act = useCallback(
    async (input: PrinterActionInput, failure: string) => {
      try {
        return await throwing(input);
      } catch (error) {
        notify({ message: failure, error, tone: 'critical' });
        return null;
      }
    },
    [throwing],
  );
  const fire = useCallback(
    (input: PrinterActionInput, failure: string): void => {
      background(act(input, failure), 'printer.action_failed');
    },
    [act],
  );
  return { act, fire, throwing };
}
