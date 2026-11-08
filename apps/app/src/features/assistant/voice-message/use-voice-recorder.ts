import { useEffect, useState } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type AudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { Logger, messageOf } from '@smarteverything/logging';
import { usePausable } from '../../../design/external-store';
import {
  VoiceRecorderMachine,
  type FrameScheduler,
  type RecordedClip,
  type RecordedVoice,
  type RecorderDevice,
  type RecorderOutcome,
  type RecorderPhase,
  type StopOutcome,
} from './voice-recorder-machine';

const log = new Logger('app.voice-message');

const MS_PER_SECOND = 1000;

const RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

const FRAMES: FrameScheduler = {
  request: (run) => requestAnimationFrame(run),
  cancel: (handle) => {
    cancelAnimationFrame(handle);
  },
};

export interface VoiceRecorder {
  readonly phase: RecorderPhase;
  readonly seconds: number;
  readonly denied: boolean;
  readonly locked: boolean;
  readonly clip: RecordedClip | null;
  readonly level: SharedValue<number>;
  readonly elapsedMs: SharedValue<number>;
  readonly start: () => Promise<void>;
  readonly pause: () => void;
  readonly resume: () => void;
  readonly lock: () => void;
  readonly stop: () => Promise<StopOutcome>;
  readonly finish: () => Promise<RecorderOutcome>;
  readonly cancel: () => Promise<void>;
}

function deviceOf(recorder: AudioRecorder): RecorderDevice {
  let prepared = false;
  const stop = async (): Promise<string | null> => {
    try {
      if (prepared) {
        prepared = false;
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
      prepared = true;
      log.info('voice_message.started', {});
    },
    pause: (): void => {
      recorder.pause();
    },
    resume: (): void => {
      recorder.record();
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
    meteringDb: () => recorder.getStatus().metering ?? null,
    read: async (uri): Promise<RecordedVoice> => {
      const response = await fetch(uri);
      return {
        data: await response.arrayBuffer(),
        mime: response.headers.get('content-type') ?? '',
      };
    },
  };
}

type Controls = Pick<
  VoiceRecorder,
  'start' | 'pause' | 'resume' | 'lock' | 'stop' | 'finish' | 'cancel'
>;

function controlsOf(machine: VoiceRecorderMachine): Controls {
  return {
    start: () => machine.start(),
    pause: (): void => {
      machine.pause();
    },
    resume: (): void => {
      machine.resume();
    },
    lock: (): void => {
      machine.lock();
    },
    stop: () => machine.stop(),
    finish: () => machine.finish(),
    cancel: () => machine.cancel(),
  };
}

export function useVoiceRecorder(visible: boolean): VoiceRecorder {
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const level = useSharedValue(0);
  const elapsedMs = useSharedValue(0);
  const [machine] = useState(
    () =>
      new VoiceRecorderMachine(
        deviceOf(recorder),
        () => new Date(),
        FRAMES,
        (frame) => {
          level.value = frame.level;
          elapsedMs.value = frame.elapsedMs;
        },
      ),
  );
  const snapshot = usePausable(machine.subscribe, machine.read);
  useEffect(() => {
    machine.setVisible(visible);
  }, [machine, visible]);
  useEffect(
    () => (): void => {
      machine.dispose().catch((cause: unknown) => {
        log.warn('voice_message.cancel_failed', { reason: messageOf(cause) });
      });
    },
    [machine],
  );
  return {
    phase: snapshot.phase,
    seconds: snapshot.seconds,
    denied: snapshot.denied,
    locked: snapshot.locked,
    clip: snapshot.clip,
    level,
    elapsedMs,
    ...controlsOf(machine),
  };
}
