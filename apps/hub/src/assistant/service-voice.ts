import type { Store } from '../store/store';
import type { EngineRegistry } from './engines/registry';
import type { ChatDirectory } from './chat-directory';
import type { AssistantRequests } from './requests';
import type { VoiceResponder } from './voice-link';
export function assistantVoice(deps: {
  readonly store: Store;
  readonly engines: EngineRegistry;
  readonly chats: ChatDirectory;
  readonly requests: AssistantRequests;
  readonly afterCall: (chatId: string, transcript: string) => void;
}): VoiceResponder {
  return {
    ready: (chatId?: string): string | null =>
      chatId === undefined ? null : deps.engines.ready(deps.store.aiChats.chat(chatId)),
    chatForCall: ({ chatId, ...place }): string => deps.chats.chatForCall(place, chatId).id,
    request: (task): string => deps.requests.voice(task),
    callEnded: deps.afterCall,
  };
}
