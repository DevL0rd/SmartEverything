import type { WakeSensitivity } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { WakeKeywords } from '../wake-name/keyword-lines';
import { NoEarHostError, type EarHosts } from './ear-hosts';

export interface NearScoreDeps {
  readonly keywords: Pick<WakeKeywords, 'earConfig'>;
  readonly names: () => readonly string[];
  readonly hosts: Pick<EarHosts, 'score'>;
  readonly log: Logger;
}

export function nearHeardBy(
  deps: NearScoreDeps,
): (pcm: Int16Array, sensitivity: WakeSensitivity) => Promise<boolean> {
  return async (pcm, sensitivity) => {
    const { keywords, nearMissThreshold } = deps.keywords.earConfig(deps.names(), sensitivity);
    if (keywords.length === 0) return false;
    try {
      return await deps.hosts.score({ keywords, threshold: nearMissThreshold, pcm });
    } catch (cause) {
      if (!(cause instanceof NoEarHostError)) throw cause;
      deps.log.warn('wake_test.near_not_scored', {
        reason: cause.message,
        consequence: 'this line is shown as heard, never as almost',
      });
      return false;
    }
  };
}
