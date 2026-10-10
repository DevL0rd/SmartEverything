import {
  CLIENT_PREFS,
  ECHO_POLICY,
  speechDetectionOf,
  type CallAudioPref,
  type EchoMode,
  type EchoPolicy,
  type SpeechDetection,
  type VoiceDetection,
} from '@smarteverything/domain';
import type { VadTuning } from './vad-library';

export const DEFAULT_CALL_AUDIO: CallAudioPref = CLIENT_PREFS.call_audio.defaultValue;

const AUTOMATIC = 'auto';

const SYSTEM_OUTPUTS: ReadonlySet<string> = new Set(['speaker', 'earpiece', AUTOMATIC]);

export interface GateSettings {
  readonly echo: EchoMode;
  readonly detection: VoiceDetection;
  readonly pauseMs: number;
}

export interface MicrophoneSettings {
  readonly noiseSuppression: boolean;
  readonly autoGainControl: boolean;
  readonly deviceId: string | null;
}

export function gateSettingsOf(pref: CallAudioPref): GateSettings {
  return { echo: pref.echo, detection: pref.detection, pauseMs: pref.pause_ms };
}

export function echoPolicyOf(settings: GateSettings): EchoPolicy {
  return ECHO_POLICY[settings.echo];
}

export function detectionOf(settings: GateSettings): SpeechDetection {
  return speechDetectionOf(settings.detection, settings.pauseMs);
}

export function tuningOf(settings: GateSettings): VadTuning {
  const detection = detectionOf(settings);
  return {
    positiveSpeechThreshold: detection.positiveSpeechThreshold,
    negativeSpeechThreshold: detection.negativeSpeechThreshold,
    redemptionMs: detection.redemptionMs,
    minSpeechMs: detection.minSpeechMs,
  };
}

export function microphoneSettingsOf(pref: CallAudioPref): MicrophoneSettings {
  return {
    noiseSuppression: pref.noise_suppression,
    autoGainControl: pref.auto_gain,
    deviceId: pref.input === AUTOMATIC ? null : pref.input,
  };
}

export function sinkIdOf(pref: CallAudioPref): string {
  return SYSTEM_OUTPUTS.has(pref.output) ? '' : pref.output;
}

export function sameGate(left: GateSettings, right: GateSettings): boolean {
  return (
    left.echo === right.echo && left.detection === right.detection && left.pauseMs === right.pauseMs
  );
}

export function sameMicrophone(left: MicrophoneSettings, right: MicrophoneSettings): boolean {
  return (
    left.noiseSuppression === right.noiseSuppression &&
    left.autoGainControl === right.autoGainControl &&
    left.deviceId === right.deviceId
  );
}

export function sameSight(left: CallAudioPref, right: CallAudioPref): boolean {
  return (
    left.video_mode === right.video_mode &&
    left.memory_seconds === right.memory_seconds &&
    left.look.length === right.look.length &&
    left.look.every((source) => right.look.includes(source))
  );
}
