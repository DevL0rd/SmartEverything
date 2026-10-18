import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  API_ENDPOINTS as E,
  type ComputerFeature,
  type DisplayChangeInput,
  type DisplayState,
  type PendingRevert,
} from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { api } from '../../../api/transport';
import { notify } from '../../../components/toast-store';
import { computerLive, useComputerPart } from '../../../store/computer-live';
import { useComputerDetail } from './computer-metrics';
import { feedState, refreshState, useStateSeed, type StateLoad } from './computer-state';

const log = new Logger('app.computers');

export interface DisplaysView {
  readonly state: DisplayState | undefined;
  readonly pending: PendingRevert | null;
  readonly deciding: boolean;
  readonly features: readonly ComputerFeature[] | undefined;
  readonly load: StateLoad;
  readonly change: (change: DisplayChangeInput) => void;
  readonly decide: (keep: boolean, token: string) => void;
  readonly expire: (token: string) => void;
}

function useExpiredRevert(deviceId: string): {
  readonly expired: string | null;
  readonly expire: (token: string) => void;
} {
  const [expired, setExpired] = useState<string | null>(null);
  return {
    expired,
    expire: (token): void => {
      setExpired(token);
      background(
        refreshState(deviceId, 'displays').then(() => {
          if (computerLive.store(deviceId).get().parts.displays?.pendingRevert?.token !== token) {
            notify({ message: 'Reverted. No answer in 15 s' });
          }
        }),
        'computer_displays.refresh_failed',
      );
    },
  };
}

function useDisplayMutations(deviceId: string): {
  readonly change: (change: DisplayChangeInput) => void;
  readonly decide: (keep: boolean, token: string) => void;
  readonly deciding: boolean;
} {
  const changeMutation = useMutation({
    mutationFn: async (change: DisplayChangeInput) => {
      const answer = await api().call(E.changeComputerDisplay, {
        params: { deviceId },
        body: change,
      });
      feedState(deviceId, { displays: answer });
      return answer;
    },
    onError: (error, change) => {
      log.error('displays.change_failed', error, { deviceId, action: change.action });
      notify({ message: 'The screen wasn’t changed', error, tone: 'critical' });
    },
  });
  const decideMutation = useMutation({
    mutationFn: async (decision: { readonly keep: boolean; readonly token: string }) => {
      const answer = await api().call(E.confirmComputerDisplay, {
        params: { deviceId },
        body: decision,
      });
      feedState(deviceId, { displays: answer });
      return answer;
    },
    onSuccess: (_answer, decision) => {
      notify({ message: decision.keep ? 'Display settings kept' : 'Display settings reverted' });
    },
    onError: (error, decision) => {
      log.error('displays.decision_failed', error, { deviceId, keep: decision.keep });
      notify({ message: 'Couldn’t keep or revert the change', error, tone: 'critical' });
    },
  });
  return {
    change: (change): void => {
      changeMutation.mutate(change);
    },
    decide: (keep, token): void => {
      decideMutation.mutate({ keep, token });
    },
    deciding: decideMutation.isPending,
  };
}

export function useComputerDisplays(deviceId: string, online: boolean): DisplaysView {
  const state = useComputerPart(deviceId, 'displays');
  const features = useComputerDetail(deviceId, online).data?.features;
  const load = useStateSeed(deviceId, 'displays', online);
  const { expired, expire } = useExpiredRevert(deviceId);
  const waiting = state?.pendingRevert ?? null;
  return {
    state,
    pending: waiting !== null && waiting.token !== expired ? waiting : null,
    features,
    load,
    expire,
    ...useDisplayMutations(deviceId),
  };
}
