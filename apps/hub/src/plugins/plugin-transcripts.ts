import type { TranscriptDetail, TranscriptSession } from '@smarteverything/domain';
import type { Transcripts } from '../transcripts/transcript-service';

export interface PluginTranscripts {
  readonly list: (limit: number) => readonly TranscriptSession[];
  readonly read: (id: string, after: number, limit: number) => TranscriptDetail | null;
  readonly remove: (id: string) => boolean;
}

function ownedBy(pluginId: string, session: TranscriptSession | undefined): boolean {
  return session?.source === 'plugin' && session.plugin_id === pluginId;
}

const PAGE = 200;

function listed(transcripts: Transcripts, pluginId: string, limit: number): TranscriptSession[] {
  const own: TranscriptSession[] = [];
  let before: string | undefined;
  while (own.length < limit) {
    const page = transcripts.list({ source: 'plugin', limit: PAGE, before });
    own.push(...page.filter((session) => ownedBy(pluginId, session)));
    const last = page.at(-1);
    if (page.length < PAGE || last === undefined) {
      break;
    }
    before = last.started_at;
  }
  return own.slice(0, limit);
}

export function transcriptsOf(transcripts: Transcripts, pluginId: string): PluginTranscripts {
  return {
    list: (limit): TranscriptSession[] => listed(transcripts, pluginId, limit),
    read: (id, after, limit): TranscriptDetail | null =>
      ownedBy(pluginId, transcripts.find(id)) ? transcripts.read(id, after, limit) : null,
    remove: (id): boolean => {
      const session = transcripts.find(id);
      if (!ownedBy(pluginId, session) || session?.ended_at === null) {
        return false;
      }
      transcripts.remove(id);
      return true;
    },
  };
}
