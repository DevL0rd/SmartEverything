import type { ListeningConfig, WakeSensitivity } from '@smarteverything/domain';
import type { EarSpotter } from '../../wake-name/ear';
import type { KeywordListening, KeywordSpotter } from '../../wake-name/keyword-spotter';

export type KeywordEngine = Pick<
  KeywordSpotter,
  'earConfig' | 'listenKeywords' | 'nearKeywords' | 'free'
>;

export class RelayedSpotter implements EarSpotter {
  private readonly lines: string;

  constructor(
    private readonly engine: KeywordEngine,
    private readonly config: ListeningConfig,
  ) {
    this.lines = config.keywords.join('\n');
  }

  keyOf(_names: readonly string[], sensitivity: WakeSensitivity): string {
    return `${sensitivity}\n${this.lines}`;
  }

  listen(_names: readonly string[], sensitivity: WakeSensitivity): KeywordListening | null {
    return this.engine.listenKeywords(this.lines, this.config.threshold, sensitivity);
  }

  near(_names: readonly string[], sensitivity: WakeSensitivity): KeywordListening | null {
    return this.engine.nearKeywords(this.lines, this.config.nearMissThreshold, sensitivity);
  }
}
