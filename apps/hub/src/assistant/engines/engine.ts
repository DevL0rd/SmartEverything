import type {
  AiChatRow,
  EngineKind,
  ChatActivityNotice,
  AssistantMessageRow,
} from '@smarteverything/domain';
import type { StoredAttachment } from '../../store/repositories/assistant-chat';
import type { StoredEvent } from '../../store/repositories/assistant-events';
import type { ChatOwner } from '../chat-directory';

export interface EngineStatus {
  readonly state: 'ready' | 'working' | 'unavailable';
  readonly reason: string | null;
}

export interface HelperProviderInput {
  readonly target: AiChatRow;
  readonly clientId: string;
  readonly files: readonly StoredAttachment[];
  readonly text: string;
  readonly quote: string | null;
}

export interface Engine {
  readonly ownerOnly: boolean;
  readonly kind: EngineKind;
  readonly activity?: (profileId: string) => readonly ChatActivityNotice[];
  readonly helperReady?: (
    chat: AiChatRow,
    role: ChatOwner['role'],
    attachments: boolean,
  ) => string | null;
  readonly status: (chat: AiChatRow) => EngineStatus;
  readonly deliver: (event: StoredEvent, chat: AiChatRow) => Promise<void>;
  readonly preflightHelperInput?: (input: HelperProviderInput) => Promise<void>;
  readonly steer?: (event: StoredEvent, chat: AiChatRow) => Promise<boolean>;
  readonly historyRemoved?: (chat: AiChatRow, rows: readonly AssistantMessageRow[]) => void;
  readonly historyChanged: (chat: AiChatRow, owner: ChatOwner) => Promise<void>;
  readonly compact: (chat: AiChatRow, clientId?: string) => Promise<boolean>;
  readonly interrupt: (chat: AiChatRow) => Promise<void>;
}
