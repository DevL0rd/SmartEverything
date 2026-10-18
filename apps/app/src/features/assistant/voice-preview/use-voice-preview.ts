import { useEffect, useState } from 'react';
import type { CallVoice } from '@smarteverything/domain';
import { useValue } from '../../../design/external-store';
import { callActive, callState } from '../call/call-state';
import { VoicePreviewController, type VoicePreviewState } from './preview-controller';
import { voicePreviewPorts } from './preview-audio';

export interface VoicePreviewControl {
  readonly state: VoicePreviewState;
  readonly stop: () => void;
  readonly toggle: (voice: CallVoice) => void;
}
export function useVoicePreview(): VoicePreviewControl {
  const [controller] = useState(() => new VoicePreviewController());
  const state = useValue(controller.state);
  useEffect(() => {
    const call = callState.subscribe(() => {
      if (callActive(callState.get())) controller.stop();
    });
    return (): void => {
      call();
      controller.stop();
    };
  }, [controller]);
  return {
    state,
    stop: (): void => {
      controller.stop();
    },
    toggle: (voice): void => {
      if (!callActive(callState.get())) controller.toggle(voice, voicePreviewPorts());
    },
  };
}
