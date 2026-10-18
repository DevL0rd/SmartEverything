import { useMutation } from '@tanstack/react-query';
import { Logger } from '@smarteverything/logging';
import { API_ENDPOINTS as E, type PhoneAction } from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { notify } from '../../../components/toast-store';
import type { Device } from '../../../store/state';

const log = new Logger('app.phone');

export interface PhoneActionRun {
  readonly action: PhoneAction;
  readonly failure: string;
  readonly done?: string;
}

export interface PhoneActionOutcome {
  readonly ok: boolean;
  readonly detail: string;
}

export function usePhoneRun(
  device: Device,
): ReturnType<typeof useMutation<PhoneActionOutcome, Error, PhoneActionRun>> {
  return useMutation({
    mutationFn: async ({ action }: PhoneActionRun): Promise<PhoneActionOutcome> => {
      log.info('phone.action_started', { deviceId: device.id, type: action.type });
      const result = await api().call(E.runPhoneAction, {
        params: { deviceId: device.id },
        body: action,
      });
      return { ok: result.ok, detail: result.detail };
    },
    onSuccess: ({ ok, detail }, { action, failure, done }) => {
      log.info('phone.action_answered', { deviceId: device.id, type: action.type, ok });
      notify(
        ok
          ? { message: done ?? detail, tone: 'positive' }
          : { message: failure, detail, tone: 'critical' },
      );
    },
    onError: (error, { action, failure }) => {
      log.error('phone.action_failed', error, { deviceId: device.id, type: action.type });
      notify({ message: failure, error, tone: 'critical' });
    },
  });
}

export function usePhoneAction(
  device: Device,
): (action: PhoneAction, doneMessage?: string) => void {
  const run = usePhoneRun(device);
  return (action, doneMessage) => {
    run.mutate({
      action,
      failure: `${device.label} did not take that`,
      ...(doneMessage === undefined ? {} : { done: doneMessage }),
    });
  };
}
