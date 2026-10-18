import { Logger } from '@smarteverything/logging';
import { useMutation } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  type ComputerApps,
  type WindowAction,
  type WindowRow,
} from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { notify } from '../../../components/toast-store';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { sameJson } from '../../../store/same-json';
import { useComputerSelect } from './computer-metrics';
import { feedState } from './computer-state';

const log = new Logger('app.computers');

export function useOpenWindows(deviceId: string): readonly WindowRow[] | undefined {
  return useComputerSelect(deviceId, (parts) => parts.windows?.windows, sameJson);
}

interface WindowRequest {
  readonly window: WindowRow;
  readonly action: WindowAction;
}

export function useWindowChange(
  deviceId: string,
): ReturnType<typeof useMutation<unknown, Error, WindowRequest>> {
  return useMutation({
    mutationFn: async ({ window, action }: WindowRequest) => {
      log.info('window.change_started', { deviceId, action });
      const state = await api().call(E.changeComputerWindow, {
        params: { deviceId },
        body: { windowId: window.id, action },
      });
      feedState(deviceId, { windows: state });
      return state;
    },
    onError: (error, { window, action }) => {
      log.error('window.change_failed', error, { deviceId, action });
      notify({
        message: `${window.app?.name ?? 'The window'} didn’t respond`,
        error,
        tone: 'critical',
      });
    },
  });
}

export function useComputerApps(
  deviceId: string,
  enabled: boolean,
): ReturnType<typeof useScreenQuery<ComputerApps>> {
  return useScreenQuery({
    queryKey: ['window', 'computer-apps', deviceId],
    queryFn: () => api().call(E.listComputerApps, { params: { deviceId } }),
    enabled,
    retry: false,
  });
}

export function useOpenApp(
  deviceId: string,
  machine: string,
): ReturnType<typeof useMutation<unknown, Error, { readonly id: string; readonly name: string }>> {
  return useMutation({
    mutationFn: ({ id }: { readonly id: string; readonly name: string }) => {
      log.info('app.open_started', { deviceId, appId: id });
      return api().call(E.openComputerApp, { params: { deviceId }, body: { appId: id } });
    },
    onSuccess: (_done, { id, name }) => {
      log.info('app.open_succeeded', { deviceId, appId: id });
      notify({ message: `Opened ${name} on ${machine}`, tone: 'positive' });
    },
    onError: (error, { id, name }) => {
      log.error('app.open_failed', error, { deviceId, appId: id });
      notify({ message: `${name} wasn’t opened`, error, tone: 'critical' });
    },
  });
}

export function useCloseApp(
  deviceId: string,
): ReturnType<typeof useMutation<number, Error, { readonly id: string; readonly name: string }>> {
  return useMutation({
    mutationFn: async ({ id }: { readonly id: string; readonly name: string }) => {
      log.info('app.close_started', { deviceId, appId: id });
      return (
        await api().call(E.closeComputerApp, {
          params: { deviceId },
          body: { appId: id, force: false },
        })
      ).windows;
    },
    onSuccess: (windows, { id, name }) => {
      log.info('app.close_succeeded', { deviceId, appId: id, windows });
      notify({ message: windows === 0 ? `${name} had no open windows` : `Closed ${name}` });
    },
    onError: (error, { id, name }) => {
      log.error('app.close_failed', error, { deviceId, appId: id });
      notify({ message: `${name} wasn’t closed`, error, tone: 'critical' });
    },
  });
}
