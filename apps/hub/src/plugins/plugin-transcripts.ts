import type { PluginSpeechReader } from '../store/repositories/speech';
import {
  ApiError,
  type TranscriptDetail,
  type TranscriptSession,
  type TranscriptPage,
  type TranscriptRange,
} from '@smarteverything/domain';
import type { ToolCaller } from '../ai-tools/hub-tool';
import type { Store } from '../store/store';
import type { TranscriptFeedQuery, TranscriptScope } from '../store/repositories/transcript-reader';
import type {
  PluginTranscriptPage,
  PluginTranscriptPageQuery,
} from '../store/repositories/plugin-transcript-page';
import { ownerProfileOf } from '../transcripts/owner';
import type { Transcripts } from '../transcripts/transcript-service';

export interface PluginTranscripts {
  readonly speechReader: (reader: PluginSpeechReader) => () => void;
  readonly list: (limit: number) => readonly TranscriptSession[];
  readonly find: (id: string) => TranscriptSession | null;
  readonly read: (id: string, after: number, limit: number) => TranscriptDetail | null;
  readonly page: (id: string, query: PluginTranscriptPageQuery) => PluginTranscriptPage | null;
  readonly scope: (caller: ToolCaller, sourceId: string) => TranscriptScope;
  readonly feed: (scope: TranscriptScope, query: TranscriptFeedQuery) => TranscriptPage;
  readonly range: (scope: TranscriptScope, anchor: number, limit: number) => TranscriptRange;
  readonly remove: (id: string) => boolean;
}

function readerScope(
  store: Pick<Store, 'clients' | 'profiles'>,
  pluginId: string,
  caller: ToolCaller,
  sourceId: string,
): TranscriptScope {
  const owner =
    caller.role === 'owner' &&
    caller.profileId === ownerProfileOf(store) &&
    (caller.pluginRequester === undefined
      ? caller.pluginId === undefined
      : caller.pluginRequester === 'owner');
  if (!owner)
    throw new ApiError('forbidden', 'Only the owner’s active profile reads plugin transcripts.');
  const actor = JSON.stringify({
    client: caller.clientId,
    profile: caller.profileId,
    plugin: caller.pluginId,
    requester: caller.pluginRequester,
    authority: caller.authority,
    via: caller.via,
  });
  return { kind: 'plugin', pluginId, sourceId, actor };
}

function ownScope(pluginId: string, scope: TranscriptScope): TranscriptScope {
  if (scope.kind !== 'plugin' || scope.pluginId !== pluginId) {
    throw new ApiError('forbidden', 'The transcript scope belongs to a different source.');
  }
  return scope;
}

export function transcriptsOf(
  transcripts: Transcripts,
  pluginId: string,
  store: Pick<Store, 'clients' | 'profiles'>,
): PluginTranscripts {
  const find = (id: string): TranscriptSession | null => {
    const session = transcripts.find(id);
    return session?.source === 'plugin' && session.plugin_id === pluginId ? session : null;
  };
  return {
    speechReader: (reader) => transcripts.speechReader(pluginId, reader),
    list: (limit): TranscriptSession[] => transcripts.list({ source: 'plugin', pluginId, limit }),
    find,
    read: (id, after, limit): TranscriptDetail | null =>
      find(id) === null ? null : transcripts.read(id, after, limit),
    page: (id, query): PluginTranscriptPage | null =>
      find(id) === null ? null : transcripts.pluginPage(pluginId, id, query),
    scope: (caller, sourceId): TranscriptScope => readerScope(store, pluginId, caller, sourceId),
    feed: (scope, query): TranscriptPage => transcripts.feed(ownScope(pluginId, scope), query),
    range: (scope, anchor, limit): TranscriptRange =>
      transcripts.range(ownScope(pluginId, scope), anchor, limit),
    remove: (id): boolean => {
      const session = find(id);
      if (session === null) return false;
      if (session.ended_at === null) return false;
      transcripts.remove(id);
      return true;
    },
  };
}
