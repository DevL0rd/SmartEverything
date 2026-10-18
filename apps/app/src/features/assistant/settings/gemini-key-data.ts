import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { API_ENDPOINTS as E, type AssistantVoiceStatus } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from '../../../api/transport';

const log = new Logger('app.assistant');

const STATUS_KEY = ['window', 'assistant-voice', 'status'] as const;

export function useGeminiStatus(): UseQueryResult<AssistantVoiceStatus> {
  return useScreenQuery({
    queryKey: STATUS_KEY,
    queryFn: () => api().call(E.readAssistantVoice, {}),
  });
}

export interface GeminiActions {
  readonly saveKey: (key: string) => Promise<AssistantVoiceStatus>;
  readonly importKey: () => Promise<AssistantVoiceStatus>;
  readonly removeKey: () => Promise<AssistantVoiceStatus>;
}

export function useGeminiActions(): GeminiActions {
  const client = useQueryClient();
  const changed = (status: AssistantVoiceStatus): AssistantVoiceStatus => {
    client.setQueryData(STATUS_KEY, status);
    return status;
  };
  return {
    saveKey: async (key): Promise<AssistantVoiceStatus> => {
      const status = await api().call(E.setGeminiKey, { body: { key } });
      log.info('assistant.gemini_key_saved', {});
      return changed(status);
    },
    importKey: async (): Promise<AssistantVoiceStatus> => {
      const status = await api().call(E.importGeminiKey, { body: { source: 'aibinator' } });
      log.info('assistant.gemini_key_imported', {});
      return changed(status);
    },
    removeKey: async (): Promise<AssistantVoiceStatus> => {
      const status = await api().call(E.removeGeminiKey, {});
      log.info('assistant.gemini_key_removed', {});
      return changed(status);
    },
  };
}
