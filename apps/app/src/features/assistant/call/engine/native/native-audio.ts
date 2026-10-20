import {
  BARGE_IN_LEVEL,
  CLIENT_PREFS,
  DEFAULT_PAUSE_MS,
  callAudioWith,
  ECHO_POLICY,
  redemptionOf,
  VOICE_DETECTION,
  type CallAudio,
} from '@smarteverything/domain';
import type { NativeAudioSettings } from '../../../../../../modules/health-connect';

export const DEFAULT_CALL_AUDIO: CallAudio = callAudioWith(
  CLIENT_PREFS.call_audio.defaultValue,
  DEFAULT_PAUSE_MS,
);

export function nativeAudioOf(pref: CallAudio): NativeAudioSettings {
  const policy = ECHO_POLICY[pref.echo];
  const detection = VOICE_DETECTION[pref.detection];
  return {
    echoTailMs: policy.echoTailMs,
    sustainMs: policy.sustainMs,
    bargeInLevel: BARGE_IN_LEVEL.echoCancelled * policy.bargeInLevelScale,
    ignoreAssistantAudible: policy.ignoreAssistantAudible,
    aggressiveWhileAudible: policy.aggressiveWhileAudible,
    interruptible: policy.interruptible,
    speechThreshold: detection.positiveSpeechThreshold,
    minSpeechMs: detection.minSpeechMs,
    pauseMs: redemptionOf(pref.pause_ms),
    noiseSuppression: pref.noise_suppression,
    autoGain: pref.auto_gain,
    input: pref.input,
    output: pref.output,
    volume: pref.volume,
  };
}
