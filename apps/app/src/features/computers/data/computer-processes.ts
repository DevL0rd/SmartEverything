import { Logger, background } from '@smarteverything/logging';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  PROCESS_NICE,
  type ProcessDetail,
  type ProcessSignal,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { confirm } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { sendConfirmingHub, type HubConfirmOutcome } from './hub-confirm';

const log = new Logger('app.computers');

export interface SignalRequest {
  readonly pid: number;
  readonly name: string;
  readonly signal: ProcessSignal;
}

export type SignalOutcome = HubConfirmOutcome;

const SIGNAL_DONE: Readonly<Record<ProcessSignal, (name: string) => string>> = {
  end: (name) => `Ended ${name}`,
  force: (name) => `Force quit ${name}`,
  stop: (name) => `Paused ${name}`,
  continue: (name) => `Resumed ${name}`,
};

const SIGNAL_FAILED: Readonly<Record<ProcessSignal, (name: string) => string>> = {
  end: (name) => `${name} wasn’t ended`,
  force: (name) => `${name} wasn’t force quit`,
  stop: (name) => `${name} wasn’t paused`,
  continue: (name) => `${name} wasn’t resumed`,
};

function detailKey(deviceId: string, pid: number): readonly string[] {
  return ['window', 'computer-process', deviceId, String(pid)];
}

export function signalProcess(deviceId: string, request: SignalRequest): Promise<SignalOutcome> {
  return sendConfirmingHub(
    (confirmed) =>
      api().call(E.signalComputerProcess, {
        params: { deviceId },
        body: {
          pid: request.pid,
          signal: request.signal,
          ...(confirmed ? { confirm: true } : {}),
        },
      }),
    () =>
      confirm({
        title: `${request.name} runs the hub`,
        body: 'Stopping it also stops everything in your home that depends on the hub.',
        confirmLabel: 'Stop the hub',
        tone: 'destructive',
      }),
  );
}

export function useProcessSignal(
  deviceId: string,
): ReturnType<typeof useMutation<SignalOutcome, Error, SignalRequest>> {
  return useMutation({
    mutationFn: (request: SignalRequest) => {
      log.info('process.signal_started', { deviceId, pid: request.pid, signal: request.signal });
      return signalProcess(deviceId, request);
    },
    onSuccess: (outcome, request) => {
      log.info('process.signal_finished', { deviceId, pid: request.pid, outcome });
      if (outcome === 'sent') notify({ message: SIGNAL_DONE[request.signal](request.name) });
    },
    onError: (error, request) => {
      log.error('process.signal_failed', error, { deviceId, pid: request.pid });
      notify({ message: SIGNAL_FAILED[request.signal](request.name), error, tone: 'critical' });
    },
  });
}

export function useProcessDetail(
  deviceId: string,
  pid: number | null,
): ReturnType<typeof useScreenQuery<ProcessDetail>> {
  return useScreenQuery({
    queryKey: detailKey(deviceId, pid ?? 0),
    queryFn: () =>
      api().call(E.readComputerProcess, { params: { deviceId, pid: String(pid ?? 0) } }),
    enabled: pid !== null,
    retry: false,
  });
}

export type Priority = keyof typeof PROCESS_NICE;

export function useProcessPriority(
  deviceId: string,
): ReturnType<
  typeof useMutation<unknown, Error, { readonly pid: number; readonly priority: Priority }>
> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ pid, priority }: { readonly pid: number; readonly priority: Priority }) => {
      log.info('process.priority_started', { deviceId, pid, priority });
      return api().call(E.prioritiseComputerProcess, {
        params: { deviceId, pid: String(pid) },
        body: { nice: PROCESS_NICE[priority] },
      });
    },
    onSuccess: (_done, { pid }) => {
      background(
        client.invalidateQueries({ queryKey: detailKey(deviceId, pid) }),
        'queries.invalidate_failed',
      );
    },
    onError: (error, { pid }) => {
      log.error('process.priority_failed', error, { deviceId, pid });
      notify({ message: 'Priority wasn’t changed', error, tone: 'critical' });
    },
  });
}
