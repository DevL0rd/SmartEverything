import { API_ENDPOINTS as E, ApiError } from '@smarteverything/domain';
import type { AssistantVoice } from '../../assistant-voice/assistant-voice';
import { clientOf, type Caller } from '../auth';
import { bound, type Bound } from '../router';
import { currentRequestSignal } from '../request-signal';

type AssistantVoiceRoutes = Record<
  | 'readAssistantVoice'
  | 'importGeminiKey'
  | 'setGeminiKey'
  | 'removeGeminiKey'
  | 'previewAssistantVoice'
  | 'cancelAssistantVoicePreview',
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
    previewAssistantVoice: bound(E.previewAssistantVoice, ({ body, caller }) =>
      voice.preview(
        clientOf(caller),
        caller.kind === 'client' ? caller.profileId : undefined,
        body,
        currentRequestSignal(),
      ),
    ),
    cancelAssistantVoicePreview: bound(E.cancelAssistantVoicePreview, ({ body, caller }) => {
      voice.previews.cancel(clientOf(caller).id, body);
      return {};
    }),
    readAssistantVoice: bound(E.readAssistantVoice, () => voice.keys.status()),
    importGeminiKey: bound(E.importGeminiKey, ({ body, caller }) => {
      onThisComputer(caller);
      return voice.keys.importFrom(body.source);
    }),
    setGeminiKey: bound(E.setGeminiKey, ({ body }) => voice.keys.save(body.key)),
    removeGeminiKey: bound(E.removeGeminiKey, () => voice.keys.remove()),
  };
}
