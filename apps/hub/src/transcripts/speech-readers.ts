import { ApiError, type SpeechTrigger } from '@smarteverything/domain';
import type { PluginSpeechReader } from '../store/repositories/speech';
import type { Store } from '../store/store';
import type { SpeechReaderTool } from './speech-admission';
import { logSpeechReadFailure } from './speech-failures';
import type { SpeechPrincipal } from './speech-principal';

export function readerTools(store: Pick<Store, 'live'>): readonly SpeechReaderTool[] {
  return store.live.speechReaders
    .plugins()
    .map(([pluginId, reader]) => ({ pluginId, tool: reader.readTool().name }));
}

export function liveReader(store: Pick<Store, 'live'>, pluginId: string): PluginSpeechReader {
  const reader = store.live.speechReaders.plugin(pluginId);
  if (reader === undefined)
    throw new ApiError('forbidden', 'This speech source plugin is unavailable.');
  return reader;
}

export async function admitSpeechSources(
  store: Pick<Store, 'live' | 'host'>,
  principal: SpeechPrincipal,
  triggers: readonly SpeechTrigger[],
): Promise<SpeechPrincipal> {
  const admission = await store.host.read('speechAdmission', {
    principal,
    readers: readerTools(store),
    triggers,
  });
  const checked = await Promise.all(
    admission.readers.map(async (pluginId) => {
      try {
        await liveReader(store, pluginId).admit(admission.caller);
        return [pluginId];
      } catch (cause) {
        logSpeechReadFailure(cause);
        return [];
      }
    }),
  );
  const admitted = checked.flat();
  for (const trigger of triggers) {
    const source = trigger.source;
    if (source?.kind !== 'plugin') continue;
    if (!admitted.includes(source.pluginId))
      throw new ApiError('forbidden', 'The selected plugin speech reader is not authorized.');
    await liveReader(store, source.pluginId).admit(admission.caller, source.sourceId);
  }
  return { ...principal, plugins: admitted };
}
