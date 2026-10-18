import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  type ServiceOperation,
  type StartupState,
  type SystemChange,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { ServerUnreachableError } from '../../../api/connection/client';
import { api } from '../../../api/transport';
import { confirm } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { feedState } from './computer-state';
import { sendConfirmingHub, type HubConfirmOutcome } from './hub-confirm';
import { hubServiceAsk } from '../system/system-model';

const log = new Logger('app.computers');

const CHANGE_NAME: Readonly<Record<SystemChange['action'], string>> = {
  power_mode: 'Power mode',
  dnd: 'Do Not Disturb',
  keyboard_layout: 'Keyboard layout',
  wifi: 'Wi-Fi',
  wifi_connect: 'Wi-Fi network',
  bluetooth: 'Bluetooth',
  bluetooth_device: 'Bluetooth device',
};

export function useSystemChange(
  deviceId: string,
): ReturnType<typeof useMutation<unknown, Error, SystemChange>> {
  return useMutation({
    mutationFn: async (change: SystemChange) => {
      log.info('system.change_started', { deviceId, action: change.action });
      const state = await api().call(E.changeComputerSystem, {
        params: { deviceId },
        body: change,
      });
      feedState(deviceId, { system: state });
      return state;
    },
    onError: (error, change) => {
      log.error('system.change_failed', error, { deviceId, action: change.action });
      notify({
        message: `${CHANGE_NAME[change.action]} wasn’t changed`,
        error,
        tone: 'critical',
      });
    },
  });
}

function startupKey(deviceId: string): readonly string[] {
  return ['window', 'computer-startup', deviceId];
}

export function useStartup(
  deviceId: string,
  enabled: boolean,
): ReturnType<typeof useScreenQuery<StartupState>> {
  return useScreenQuery({
    queryKey: startupKey(deviceId),
    queryFn: () => api().call(E.readComputerStartup, { params: { deviceId } }),
    enabled,
    retry: false,
  });
}

interface StartupToggle {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
}

export function useStartupChange(
  deviceId: string,
): ReturnType<typeof useMutation<StartupState, Error, StartupToggle>> {
  const client = useQueryClient();
  const mutation: ReturnType<typeof useMutation<StartupState, Error, StartupToggle>> = useMutation({
    mutationFn: ({ id, enabled }: StartupToggle) =>
      api().call(E.changeComputerStartup, {
        params: { deviceId },
        body: { action: 'startup_app', id, enabled },
      }),
    onSuccess: (state, toggle) => {
      client.setQueryData(startupKey(deviceId), state);
      if (toggle.enabled) return;
      notify({
        message: `Startup app ${toggle.name} off`,
        undo: () => {
          mutation.mutate({ ...toggle, enabled: true });
        },
      });
    },
    onError: (error, toggle) => {
      log.error('startup.change_failed', error, { deviceId, id: toggle.id });
      notify({ message: `${toggle.name} wasn’t changed`, error, tone: 'critical' });
    },
  });
  return mutation;
}

export interface ServiceAction {
  readonly unit: string;
  readonly name: string;
  readonly operation: ServiceOperation;
  readonly hubOwn: boolean;
}

export function changeService(
  deviceId: string,
  action: ServiceAction,
  hubName: string,
): Promise<HubConfirmOutcome> {
  const { unit, name, operation, hubOwn } = action;
  return sendConfirmingHub(
    async (confirmed) => {
      try {
        const state = await api().call(E.changeComputerService, {
          params: { deviceId },
          body: { action: 'service', unit, operation, ...(confirmed ? { confirm: true } : {}) },
        });
        feedState(deviceId, { services: state });
      } catch (error) {
        const hubStopped = confirmed && hubOwn && error instanceof ServerUnreachableError;
        if (!hubStopped) throw error;
      }
    },
    () => confirm({ ...hubServiceAsk(operation, name, hubName), tone: 'destructive' }),
  );
}

export function useServiceChange(
  deviceId: string,
  hubName: string,
): ReturnType<typeof useMutation<HubConfirmOutcome, Error, ServiceAction>> {
  const mutation: ReturnType<typeof useMutation<HubConfirmOutcome, Error, ServiceAction>> =
    useMutation({
      mutationFn: (action: ServiceAction): Promise<HubConfirmOutcome> => {
        log.info('service.change_started', {
          deviceId,
          unit: action.unit,
          operation: action.operation,
        });
        return changeService(deviceId, action, hubName);
      },
      onSuccess: (outcome, action) => {
        if (outcome === 'cancelled') return;
        const { name, operation, hubOwn } = action;
        if (operation === 'stop') {
          const undo = (): void => {
            mutation.mutate({ ...action, operation: 'start' });
          };
          const message = `Stopped ${name}`;
          notify(hubOwn ? { message } : { message, undo });
        } else if (operation === 'restart') {
          notify({ message: hubOwn ? 'Restarting the hub…' : `Restarted ${name}` });
        }
      },
      onError: (error, { unit, name, operation }) => {
        log.error('service.change_failed', error, { deviceId, unit, operation });
        notify({ message: `${name} wasn’t changed`, error, tone: 'critical' });
      },
    });
  return mutation;
}
