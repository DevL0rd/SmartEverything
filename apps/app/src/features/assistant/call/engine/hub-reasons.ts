import type { AppSightSource } from '@smarteverything/domain';
import { callState } from '../call-state';

const HUB_TOO_OLD_FOR_VIDEO = 'Update your home server to share video.';

export const HUB_TOO_OLD = 'Update your home server to use this during a call.';

export function hubReason(source: AppSightSource): string | null {
  const { phase, capabilities } = callState.get();
  if (capabilities === null) {
    return phase === 'idle' || phase === 'connecting' ? null : HUB_TOO_OLD_FOR_VIDEO;
  }
  return capabilities.sight.includes(source) ? null : HUB_TOO_OLD_FOR_VIDEO;
}
