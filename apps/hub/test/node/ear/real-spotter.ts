import type { ListeningConfig, WakeSensitivity } from '@smarteverything/domain';
import { KeywordSpotter } from '../../../src/node/ear/keyword-spotter';
import { RelayedSpotter } from '../../../src/node/ear/relayed-spotter';
import { WakeKeywords } from '../../../src/wake-name/keyword-lines';

export interface RealSpotter {
  readonly spotter: RelayedSpotter;
  readonly engine: KeywordSpotter;
  readonly config: ListeningConfig;
}

export function realSpotter(
  names: readonly string[] = ['Coordinator'],
  sensitivity: WakeSensitivity = 'standard',
): RealSpotter {
  const { keywords, threshold, nearMissThreshold } = new WakeKeywords().earConfig(
    names,
    sensitivity,
  );
  const config: ListeningConfig = {
    wake: true,
    transcribe: false,
    sensitivity,
    keywords: [...keywords],
    threshold,
    nearMissThreshold,
    pause_ms: 200,
  };
  const engine = new KeywordSpotter();
  return { spotter: new RelayedSpotter(engine, config, true), engine, config };
}
