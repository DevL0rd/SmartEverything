import { useEffect, useState } from 'react';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type AudioRecorder,
} from 'expo-audio';
import { Logger, messageOf } from '@smarteverything/logging';
import { usePausable } from '../../../design/external-store';
import {
  VoiceRecorderMachine,
  type RecorderDevice,
  type RecorderOutcome,
  type RecorderPhase,
} from './voice-recorder-machine';

const log = new Logger('app.voice-message');

const MS_PER_SECOND = 1000;

export interface VoiceRecorder {
  readonly phase: RecorderPhase;
  readonly seconds: number;
  readonly denied: boolean;
  readonly start: () => Promise<void>;
  readonly finish: () => Promise<RecorderOutcome>;
  readonly cancel: () => Promise<void>;
}

function deviceOf(recorder: AudioRecorder): RecorderDevice {
  const stop = async (): Promise<string | null> => {
    try {
      if (recorder.getStatus().isRecording) {
        await recorder.stop();
      }
    } finally {
      await setAudioModeAsync({ allowsRecording: false });
    }
    return recorder.uri;
  };
  return {
    permission: async (): Promise<boolean> => (await requestRecordingPermissionsAsync()).granted,
    begin: async (): Promise<void> => {
      await setAudioModeAsync({ allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      log.info('voice_message.started', {});
    },
    end: stop,
    abort: async (): Promise<void> => {
      try {
        await stop();
      } catch (cause) {
        log.warn('voice_message.abort_failed', { reason: messageOf(cause) });
      }
    },
    elapsedMs: () => recorder.currentTime * MS_PER_SECOND,
    read: async (uri): Promise<ArrayBuffer> => (await fetch(uri)).arrayBuffer(),
  };
}

export function useVoiceRecorder(): VoiceRecorder {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder);
  const [machine] = useState(() => new VoiceRecorderMachine(deviceOf(recorder), () => new Date()));
  const snapshot = usePausable(machine.subscribe, machine.read);
  useEffect(
    () => (): void => {
      machine.cancel().catch((cause: unknown) => {
        log.warn('voice_message.cancel_failed', { reason: messageOf(cause) });
      });
    },
    [machine],
  );
  return {
    phase: snapshot.phase,
    seconds: state.durationMillis / MS_PER_SECOND,
    denied: snapshot.denied,
    start: () => machine.start(),
    finish: () => machine.finish(),
    cancel: () => machine.cancel(),
  };
}
