import { logSpeechReadFailure } from './speech-failures';
import type { ListeningSource, ResponseOf } from '@smarteverything/domain';
import type { ListeningRegistry } from '../listening/listening-registry';
import type { Store } from '../store/store';
import type { SpeechPrincipal } from './speech-principal';
import { speechToolCaller } from './speech-principal';
import { admitDeviceSpeech, admitSpeechReadTool, pluginReader } from './speech-readers';

type Entry = ResponseOf<'listSpeechSources'>['sources'][number];

const NOT_LISTENING = { listening: null } as const;

export async function readableSpeechSources(
  store: Store,
  principal: SpeechPrincipal,
  listening: Pick<ListeningRegistry, 'view'>,
): Promise<ResponseOf<'listSpeechSources'>> {
  const caller = speechToolCaller(store, principal);
  const devices = await readableDevices(store, principal, listening);
  const plugins = store.speech.plugins().flatMap(([id, reader]) => {
    try {
      pluginReader(store, id);
      admitSpeechReadTool(store, principal, reader.readTool());
      reader.admit(caller);
      return reader.sources(caller).map((entry): Entry => ({ ...entry, ...NOT_LISTENING }));
    } catch (cause) {
      logSpeechReadFailure(cause);
      return [];
    }
  });
  const chats = store.aiChats
    .chats({ profileId: principal.profileId, archived: false })
    .flatMap((chat) => {
      try {
        admitSpeechReadTool(store, principal, { name: 'chat_read' });
        return [
          {
            source: { kind: 'attachment' as const, chatId: chat.id },
            label: chat.title,
            ...NOT_LISTENING,
          },
        ];
      } catch (cause) {
        logSpeechReadFailure(cause);
        return [];
      }
    });
  return {
    sources: [...devices, ...plugins, ...chats],
    unavailable: [
      {
        kind: 'video',
        reason:
          'Video notes combine speech and visual descriptions; a speech-only commit is unavailable.',
      },
      { kind: 'image', reason: 'Image descriptions and OCR are not speech.' },
    ],
  };
}

const DEVICE_KINDS = ['camera', 'phone', 'computer'] as const;

async function readableDevices(
  store: Store,
  principal: SpeechPrincipal,
  listening: Pick<ListeningRegistry, 'view'>,
): Promise<Entry[]> {
  try {
    admitDeviceSpeech(store, principal);
  } catch (cause) {
    logSpeechReadFailure(cause);
    return [];
  }
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
