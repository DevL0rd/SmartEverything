import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { background } from '@smarteverything/logging';
import { addListeningListeners, listeningLinked } from '../../../../modules/health-connect';
import { watchLocalNetwork } from '../../../api/connection/local-network';
import { useConnection } from '../../../api/transport';
import { useSyncStatus } from '../../../store/selectors';
import { callState } from '../call/call-state';
import { phoneEar } from './phone-ear-live';

function useHubReady(): void {
  const live = useSyncStatus().status === 'live';
  useEffect(() => {
    if (live) {
      background(phoneEar.refresh(), 'phone_ear.refresh_failed');
    }
  }, [live]);
}

function useNativeEvents(): void {
  useEffect(() => {
    const events = addListeningListeners({
      state: phoneEar.nativeChanged,
      wake: (wake) => {
        background(phoneEar.heard(wake), 'phone_ear.wake_failed');
      },
    });
    return (): void => {
      events.remove();
    };
  }, []);
}

function useCalls(): void {
  useEffect(() => {
    phoneEar.callChanged();
    return callState.subscribe(phoneEar.callChanged);
  }, []);
}

function useForeground(): void {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        background(phoneEar.ensure(), 'phone_ear.ensure_failed');
      }
    });
    return (): void => {
      subscription.remove();
    };
  }, []);
}

function useNetwork(): void {
  useEffect(() => watchLocalNetwork(phoneEar.networkChanged), []);
}

function useUnpaired(): void {
  const status = useConnection().status;
  const gone = status === 'unpaired' || status === 'removed';
  useEffect(() => {
    if (gone) {
      background(phoneEar.stop(), 'phone_ear.stop_failed');
    }
  }, [gone]);
}

function Running(): null {
  useHubReady();
  useNativeEvents();
  useCalls();
  useForeground();
  useNetwork();
  useUnpaired();
  return null;
}

export function PhoneEarHost(): ReactNode {
  return listeningLinked() ? <Running /> : null;
}
