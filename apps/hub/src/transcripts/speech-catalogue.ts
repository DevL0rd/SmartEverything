import { logSpeechReadFailure } from './speech-failures';
import type { ListeningSource, ResponseOf } from '@smarteverything/domain';
import type { ListeningRegistry } from '../listening/listening-registry';
import type { Store } from '../store/store';
import type { SpeechPrincipal } from './speech-principal';
import { liveReader, readerTools } from './speech-readers';

type Entry = ResponseOf<'listSpeechSources'>['sources'][number];

const NOT_LISTENING = { listening: null } as const;

export async function readableSpeechSources(
  store: Pick<Store, 'live' | 'host'>,
  principal: SpeechPrincipal,
  listening: Pick<ListeningRegistry, 'view'>,
): Promise<ResponseOf<'listSpeechSources'>> {
  const catalogue = await store.host.read('speechCatalogue', {
    principal,
    readers: readerTools(store),
  });
  const devices = catalogue.devices ? await readableDevices(principal, listening) : [];
  const found = await Promise.all(
    catalogue.readers.map(async (pluginId) => {
      try {
        const reader = liveReader(store, pluginId);
        await reader.admit(catalogue.caller);
        const sources = await reader.sources(catalogue.caller);
        return sources.map((entry): Entry => ({ ...entry, ...NOT_LISTENING }));
      } catch (cause) {
        logSpeechReadFailure(cause);
        return [];
      }
    }),
  );
  const plugins = found.flat();
  const chats = catalogue.chats.map((chat) => ({
    source: { kind: 'attachment' as const, chatId: chat.id },
    label: chat.title,
    ...NOT_LISTENING,
  }));
  return {
    sources: [...devices, ...plugins, ...chats],
    unavailable: [
      {
        kind: 'video',
        reason:
          'Video notes combine speech and visual descriptions; a speech-only commit is unavailable.',
      },
      { kind: 'image', reason: 'Image descriptions and the text read from images are not speech.' },
    ],
  };
}

const DEVICE_KINDS = ['camera', 'phone', 'computer'] as const;

async function readableDevices(
  principal: SpeechPrincipal,
  listening: Pick<ListeningRegistry, 'view'>,
): Promise<Entry[]> {
  const view = await listening.view({
    owner: principal.role === 'owner',
    profileId: principal.profileId,
  });
  return view.sources.flatMap((source) => {
    const kind = DEVICE_KINDS.find((one) => one === source.kind);
    return kind === undefined ? [] : [deviceEntry(kind, source)];
  });
}

function deviceEntry(kind: (typeof DEVICE_KINDS)[number], source: ListeningSource): Entry {
  return {
    source: { kind, deviceId: source.key },
    label: source.name,
    listening: { wake: source.wake, transcribe: source.transcribe, state: source.state },
  };
}
