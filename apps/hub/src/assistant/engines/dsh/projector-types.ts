import type { StreamEmit } from '../../conversation/stream';
import type { HarnessService } from '../../../harness/service';
import type { ConversationLog } from '../../conversation-log';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
import type { NativeCompletionTurn } from './projector-completion';

export interface ActiveTurn extends NativeCompletionTurn {
  readonly done: () => void;
  readonly restored: boolean;
  readonly steered: StoredEvent[];
  replyId: string;
  after: string | null;
}

export interface ProjectorOptions {
  readonly service: HarnessService;
  readonly conversation: ConversationLog;
  readonly emit: StreamEmit;
  readonly finished: (event: StoredEvent, text: string, ok: boolean) => void;
}
