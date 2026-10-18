import type {
  AiChatRow,
  EngineKind,
  ChatActivityNotice,
  AssistantMessageRow,
} from '@smarteverything/domain';
import type { StoredEvent } from '../../store/repositories/assistant-events';
import type { ChatOwner } from '../chat-directory';

export interface EngineStatus {
  readonly state: 'ready' | 'working' | 'unavailable';
  readonly reason: string | null;
}

export interface Engine {
  readonly ownerOnly: boolean;
  readonly kind: EngineKind;
  readonly activity?: (profileId: string) => readonly ChatActivityNotice[];
  readonly status: (chat: AiChatRow) => EngineStatus;
  readonly deliver: (event: StoredEvent, chat: AiChatRow) => Promise<void>;
  readonly steer?: (event: StoredEvent, chat: AiChatRow) => Promise<boolean>;
  readonly historyRemoved?: (chat: AiChatRow, rows: readonly AssistantMessageRow[]) => void;
  readonly historyChanged: (chat: AiChatRow, owner: ChatOwner) => Promise<void>;
  readonly compact: (chat: AiChatRow, clientId?: string) => Promise<boolean>;
  readonly interrupt: (chat: AiChatRow) => Promise<void>;
}
