import type { AiChatRow, EngineKind } from '@smarteverything/domain';
import type { StoredEvent } from '../../store/repositories/assistant-events';

export interface EngineStatus {
  readonly state: 'ready' | 'working' | 'unavailable';
  readonly reason: string | null;
}

export interface Engine {
  readonly kind: EngineKind;
  readonly status: (chat: AiChatRow) => EngineStatus;
  readonly deliver: (event: StoredEvent, chat: AiChatRow) => Promise<void>;
  readonly interrupt: (chat: AiChatRow) => Promise<void>;
}
