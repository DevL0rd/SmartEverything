import { useEffect, useMemo } from 'react';
import { AppState } from 'react-native';
import { background } from '@smarteverything/logging';
import { ValueStore, useValue } from '../../../design/external-store';
import { useLocalPref } from '../../../store/local-prefs';
import { UNKNOWN_FACTS, readNativeFacts, type NativeFacts } from './native-facts';
import { phoneAssistantNative } from './phone-native';
import type { SetupFacts } from './setup-model';

const nativeFacts = new ValueStore<NativeFacts>(UNKNOWN_FACTS);

function same(left: NativeFacts, right: NativeFacts): boolean {
  return (
    left.assistant === right.assistant &&
    left.overlay === right.overlay &&
    left.microphone === right.microphone &&
    left.battery === right.battery
  );
}

export async function refreshSetupFacts(): Promise<void> {
  const next = await readNativeFacts(phoneAssistantNative);
  if (!same(nativeFacts.get(), next)) nativeFacts.set(next);
}

function useRefreshOnForeground(): void {
  useEffect(() => {
    background(refreshSetupFacts(), 'phone_assistant.facts_failed');
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') background(refreshSetupFacts(), 'phone_assistant.facts_failed');
    });
    return (): void => {
      subscription.remove();
    };
  }, []);
}

export function useSetupFacts(): SetupFacts {
  const native = useValue(nativeFacts);
  const sideKey = useLocalPref('sideKeyAssistant');
  useRefreshOnForeground();
  return useMemo(
    () => ({
      ...native,
      sideKey,
      canOpenSideKey: phoneAssistantNative.openSideKeySettings !== null,
    }),
    [native, sideKey],
  );
}
