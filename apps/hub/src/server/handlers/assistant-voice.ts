import {
  API_ENDPOINTS as E,
  ApiError,
  type ASSISTANT_VOICE_ENDPOINTS,
} from '@smarteverything/domain';
import { ChatVoiceReplies } from '../../assistant-voice/chat-voice-replies';
import type { Budget } from '../../ledger/budget';
import type { ServerContext } from '../context';
import type { AssistantVoice } from '../../assistant-voice/assistant-voice';
import { clientOf, type Caller } from '../auth';
import { bound, type RouteTable } from '../router';
import { currentRequestSignal } from '../request-signal';

function onThisComputer(caller: Caller): void {
  if (!clientOf(caller).built_in) {
    throw new ApiError(
      'forbidden',
      'Import the key in the desktop app on the computer that runs SmartEverything.',
    );
  }
}

export function assistantVoiceRoutes(
  { store, assistant }: Pick<ServerContext, 'store' | 'assistant'>,
  voice: AssistantVoice,
  budget: Budget['gate'],
): Pick<RouteTable, keyof typeof ASSISTANT_VOICE_ENDPOINTS> {
  const replies = new ChatVoiceReplies({ store, files: assistant.files, voice, budget });
  return {
    postChatVoiceReply: bound(E.postChatVoiceReply, ({ body, caller }) =>
      replies.post(caller, body),
    ),
    readAssistantVoiceSample: bound(E.readAssistantVoiceSample, ({ params, caller }) =>
      voice.sample(
        clientOf(caller),
        caller.kind === 'client' ? caller.profileId : undefined,
        params.voice,
        currentRequestSignal(),
      ),
    ),
    readAssistantVoice: bound(E.readAssistantVoice, () => voice.keys.status()),
    importGeminiKey: bound(E.importGeminiKey, ({ body, caller }) => {
      onThisComputer(caller);
      return voice.keys.importFrom(body.source);
    }),
    setGeminiKey: bound(E.setGeminiKey, ({ body }) => voice.keys.save(body.key)),
    removeGeminiKey: bound(E.removeGeminiKey, () => voice.keys.remove()),
  } as const;
}
