import {
  BARGE_IN_LEVEL,
  CLIENT_PREFS,
  ECHO_POLICY,
  VOICE_DETECTION,
  type CallAudioPref,
} from '@smarteverything/domain';
import type { NativeAudioSettings } from '../../../../../../modules/health-connect';

export const DEFAULT_CALL_AUDIO: CallAudioPref = CLIENT_PREFS.call_audio.defaultValue;

export function nativeAudioOf(pref: CallAudioPref): NativeAudioSettings {
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
    pauseMs: pref.pause_ms,
    noiseSuppression: pref.noise_suppression,
    autoGain: pref.auto_gain,
    input: pref.input,
    output: pref.output,
    volume: pref.volume,
  };
}
