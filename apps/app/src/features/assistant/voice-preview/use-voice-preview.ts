import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { randomUUID } from 'expo-crypto';
import type { VoicePreviewRequest } from '@smarteverything/domain';
import { connectionState } from '../../../api/connection/connection';
import { useValue } from '../../../design/external-store';
import type { EntityStore } from '../../../store/entity-store';
import { callActive, callState } from '../call/call-state';
import { VoicePreviewController, type VoicePreviewState } from './preview-controller';
import { voicePreviewPorts } from './preview-audio';

let generation = 0;
function requestOf(voice: VoicePreviewRequest['voice']): VoicePreviewRequest {
  generation = Math.max(Date.now(), generation + 1);
  return { voice, requestId: randomUUID(), generation };
}
export interface VoicePreviewControl {
  readonly state: VoicePreviewState;
  readonly stop: () => void;
  readonly toggle: (voice: VoicePreviewRequest['voice']) => void;
}
export function useVoicePreview(store: EntityStore, close: () => void): VoicePreviewControl {
  const [controller] = useState(() => new VoicePreviewController());
  const state = useValue(controller.state);
  useEffect(() => {
    const session = store.get().session;
    const profileId = session?.client.profile_id;
    const connection = connectionState.get();
    const model = store.get().assistant?.settings.voice.model;
    const dispose = (): void => {
      controller.stop();
      close();
    };
    const unsubscribe = store.subscribe(() => {
      if (
        store.get().session !== session ||
        store.get().session?.client.profile_id !== profileId ||
        store.get().assistant?.settings.voice.model !== model
      )
        dispose();
    });
    const disconnect = connectionState.subscribe(() => {
      if (connectionState.get() !== connection) dispose();
    });
    const call = callState.subscribe(() => {
      if (callActive(callState.get())) dispose();
    });
    const background = AppState.addEventListener('change', (next) => {
      if (next !== 'active') dispose();
    });
    return (): void => {
      unsubscribe();
      disconnect();
      call();
      background.remove();
      controller.stop();
    };
  }, [controller, store, close]);
  return {
    state,
    stop: (): void => {
      controller.stop();
    },
    toggle: (voice): void => {
      if (callActive(callState.get()) || AppState.currentState !== 'active') return;
      controller.toggle(requestOf(voice), voicePreviewPorts());
    },
  };
}
