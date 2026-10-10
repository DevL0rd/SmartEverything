import { API_ENDPOINTS as E, ApiError } from '@smarteverything/domain';
import type { AssistantVoice } from '../../assistant-voice/assistant-voice';
import { clientOf, type Caller } from '../auth';
import { bound, type Bound } from '../router';

type AssistantVoiceRoutes = Record<
  'readAssistantVoice' | 'importGeminiKey' | 'setGeminiKey' | 'removeGeminiKey',
  Bound
>;

function onThisComputer(caller: Caller): void {
  if (!clientOf(caller).built_in) {
    throw new ApiError(
      'forbidden',
      'Import the key in the desktop app on the computer that runs SmartEverything.',
    );
  }
}

export function assistantVoiceRoutes(voice: AssistantVoice): AssistantVoiceRoutes {
  return {
    readAssistantVoice: bound(E.readAssistantVoice, () => voice.keys.status()),
    importGeminiKey: bound(E.importGeminiKey, ({ body, caller }) => {
      onThisComputer(caller);
      return voice.keys.importFrom(body.source);
    }),
    setGeminiKey: bound(E.setGeminiKey, ({ body }) => voice.keys.save(body.key)),
    removeGeminiKey: bound(E.removeGeminiKey, () => voice.keys.remove()),
  };
}
