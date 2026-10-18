import type { PauseChoiceMs } from '@smarteverything/domain';
import type { Store } from '../store/store';

export class EndOfSpeechPause {
  private current: PauseChoiceMs;
  private readonly listeners = new Set<(pauseMs: PauseChoiceMs) => void>();
  private readonly stop: () => void;

  constructor(store: Pick<Store, 'settings' | 'feed'>) {
    this.current = store.settings.read().end_of_speech_pause_ms;
    this.stop = store.feed.subscribe((change) => {
      if (change.table !== 'settings' || change.record === null) return;
      const next = change.record.end_of_speech_pause_ms;
      if (next === this.current) return;
      this.current = next;
      this.listeners.forEach((listener) => {
        listener(next);
      });
    });
  }

  ms(): PauseChoiceMs {
    return this.current;
  }

  onChange(listener: (pauseMs: PauseChoiceMs) => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  close(): void {
    this.stop();
    this.listeners.clear();
  }
}
