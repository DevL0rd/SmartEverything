import { useScreenQuery } from '../../../queries/use-screen-query';
import { API_ENDPOINTS as E, type SpeechSourceV2 } from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { triggerSourceOf } from '../model/speech-sources';

const SPEECH_SOURCES_KEY = ['window', 'automation-speech-sources'] as const;

interface ListenSource {
  readonly source: SpeechSourceV2;
  readonly label: string;
}

export function useSpeechSources(): readonly ListenSource[] {
  const query = useScreenQuery({
    queryKey: SPEECH_SOURCES_KEY,
    queryFn: () => api().call(E.listSpeechSources, {}),
  });
  return (query.data?.sources ?? []).map((entry) => ({
    source: triggerSourceOf(entry.source),
    label: entry.label,
  }));
}
