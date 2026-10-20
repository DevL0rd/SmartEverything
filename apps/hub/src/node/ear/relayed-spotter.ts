import type { ListeningConfig, WakeSensitivity } from '@smarteverything/domain';
import type { EarSpotter } from './ear';
import type { KeywordListening, KeywordSpotter } from './keyword-spotter';

export type KeywordEngine = Pick<
  KeywordSpotter,
  'listenKeywords' | 'nearKeywords' | 'scoreOf' | 'hears' | 'free'
>;

export class RelayedSpotter implements EarSpotter {
  readonly lines: string;

  constructor(
    private readonly engine: KeywordEngine,
    private readonly config: ListeningConfig,
    private readonly watchesNear: boolean,
  ) {
    this.lines = config.keywords.join('\n');
  }

  keyOf(sensitivity: WakeSensitivity): string {
    return `${sensitivity}\n${this.lines}`;
  }

  listen(sensitivity: WakeSensitivity): KeywordListening | null {
    return this.engine.listenKeywords(this.lines, this.config.threshold, sensitivity);
  }

  near(sensitivity: WakeSensitivity): KeywordListening | null {
    return this.watchesNear
      ? this.engine.nearKeywords(this.lines, this.config.nearMissThreshold, sensitivity)
      : null;
  }
}
