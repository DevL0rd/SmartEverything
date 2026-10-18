import type { ListeningConfig, WakeSensitivity } from '@smarteverything/domain';
import { KeywordSpotter, type KeywordListening } from '../../wake-name/keyword-spotter';

export class ConfiguredSpotter extends KeywordSpotter {
  private readonly lines: string;

  constructor(private readonly config: ListeningConfig) {
    super();
    this.lines = config.keywords.join('\n');
  }

  override keyOf(_names: readonly string[], sensitivity: WakeSensitivity): string {
    return `${sensitivity}\n${this.lines}`;
  }

  override listen(
    _names: readonly string[],
    sensitivity: WakeSensitivity,
  ): KeywordListening | null {
    return this.listenKeywords(this.lines, this.config.threshold, sensitivity);
  }

  override near(): null {
    return null;
  }
}
