import type { CallAudio } from '@smarteverything/domain';
import type { Playback } from '../../../../talk';
import { sameSight, sinkIdOf } from './audio-settings';
import type { MicrophoneChain } from './microphone';

export interface TuningTargets {
  readonly mic: MicrophoneChain | null;
  readonly playback: Playback;
  readonly sight: () => void;
  readonly failed: (event: string, error: unknown) => void;
}

async function attempt(
  event: string,
  step: () => Promise<void> | void,
  failed: TuningTargets['failed'],
): Promise<void> {
  try {
    await step();
  } catch (error) {
    failed(event, error);
  }
}

export async function applyLive(
  previous: CallAudio,
  next: CallAudio,
  targets: TuningTargets,
): Promise<void> {
  const { mic, playback, failed } = targets;
  await attempt('call.microphone_apply_failed', () => mic?.apply(next), failed);
  await attempt(
    'call.speaker_apply_failed',
    async () => {
      playback.setVolume(next.volume);
      if (sinkIdOf(next) !== sinkIdOf(previous)) {
        await playback.setSink(sinkIdOf(next));
      }
    },
    failed,
  );
  if (!sameSight(previous, next)) {
    await attempt('call.sight_apply_failed', targets.sight, failed);
  }
}
