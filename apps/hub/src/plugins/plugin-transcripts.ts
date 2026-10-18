import type { PluginSpeechReader } from '../store/repositories/speech';
import type { TranscriptSession } from '@smarteverything/domain';
import type { Transcripts } from '../transcripts/transcript-service';

export interface PluginTranscripts {
  readonly speechReader: (reader: PluginSpeechReader) => () => void;
  readonly list: (limit: number) => readonly TranscriptSession[];
  readonly find: (id: string) => TranscriptSession | null;
}

export function transcriptsOf(transcripts: Transcripts, pluginId: string): PluginTranscripts {
  return {
    speechReader: (reader) => transcripts.speechReader(pluginId, reader),
    list: (limit): TranscriptSession[] => transcripts.list({ source: 'plugin', pluginId, limit }),
    find: (id): TranscriptSession | null => {
      const session = transcripts.find(id);
      return session?.source === 'plugin' && session.plugin_id === pluginId ? session : null;
    },
  };
}
