import { API_ENDPOINTS as E, ApiError } from '@smarteverything/domain';
import type { AssistantVoice } from '../../assistant-voice/assistant-voice';
import { clientOf, type Caller } from '../auth';
import { bound } from '../router';
import { currentRequestSignal } from '../request-signal';

function onThisComputer(caller: Caller): void {
  if (!clientOf(caller).built_in) {
    throw new ApiError(
      'forbidden',
      'Import the key in the desktop app on the computer that runs SmartEverything.',
    );
  }
}

export const assistantVoiceRoutes = (voice: AssistantVoice) =>
  ({
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
  }) as const;
