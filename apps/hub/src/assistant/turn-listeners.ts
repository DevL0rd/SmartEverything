import type { ChatActivityNotice, ChatStreamNotice } from '@smarteverything/domain';
import type { StoredEvent } from '../store/repositories/assistant-events';
import type { TurnActivityListener, TurnEnded } from './service-contract';

export class TurnListeners {
  private readonly ended = new Set<TurnEnded>();
  private readonly active = new Set<TurnActivityListener>();
  onFinished(listener: TurnEnded): () => void {
    this.ended.add(listener);
    return (): void => {
      this.ended.delete(listener);
    };
  }
  onActivity(listener: TurnActivityListener): () => void {
    this.active.add(listener);
    return (): void => {
      this.active.delete(listener);
    };
  }
  activity(notice: ChatActivityNotice | ChatStreamNotice): void {
    if (notice.type !== 'chat_activity') return;
    const activity = { eventId: notice.turnId, state: notice.state, steps: notice.steps };
    this.active.forEach((listener) => {
      listener(activity);
    });
  }
  finished(event: StoredEvent, text: string, ok: boolean): void {
    this.ended.forEach((listener) => {
      listener(event, text, ok);
    });
  }
}
