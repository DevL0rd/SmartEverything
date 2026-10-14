import type { z } from 'zod';
import type {
  AiChatProviderNotice,
  ComputerAiRuntime,
  AI_CHAT_RUNTIME_PROVIDER_NOTICE,
  AiChatRow,
  Engine as ChatEngine,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { ToolHub } from '../../../ai-tools/tool-hub';
import type { ToolCaller } from '../../../ai-tools/hub-tool';
import type { ComputerAiDirectory } from '../../../computers/ai-directory';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
import type { Store } from '../../../store/store';
import type { ConversationLog } from '../../conversation-log';
import type { AssistantFiles } from '../../files';
import type { TurnStream, StreamEmit } from '../../conversation/stream';
import type { ProviderReplies } from './replies';
import type { ProviderGrant } from './tool-bridge';
export interface Turn {
  readonly jobId: string;
  readonly event: StoredEvent;
  readonly chat: AiChatRow & {
    readonly engine: Exclude<ChatEngine, { kind: 'openrouter' | 'dsh' }>;
  };
  readonly replies: ProviderReplies;
  readonly stream: TurnStream;
  readonly grant: ProviderGrant;
  readonly caller: ToolCaller;
  readonly done: Promise<void>;
  readonly finish: () => void;
  readonly calls: Set<string>;
}
export interface ComputerRunnerDeps {
  readonly store: Store;
  readonly runtime: ComputerAiRuntime;
  readonly directory: ComputerAiDirectory;
  readonly conversation: ConversationLog;
  readonly files: AssistantFiles;
  readonly tools: () => ToolHub | null;
  readonly now: () => Date;
  readonly emit: StreamEmit;
  readonly providerNotice: (notice: AiChatProviderNotice, profileId: string) => void;
  readonly runtimeNotice?: (
    notice: z.infer<typeof AI_CHAT_RUNTIME_PROVIDER_NOTICE>,
    profileId: string,
  ) => void;
  readonly finished: (event: StoredEvent, text: string, ok: boolean) => void;
  readonly log: Logger;
  readonly command: (chat: AiChatRow, text: string) => void;
}
