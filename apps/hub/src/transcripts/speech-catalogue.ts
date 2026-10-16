import { logSpeechReadFailure } from './speech-failures';
import { ApiError, type ResponseOf } from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { SpeechPrincipal } from './speech-principal';
import { speechToolCaller } from './speech-principal';
import { cameraSpeechScope, admitSpeechReadTool, pluginReader } from './speech-readers';

export function readableSpeechSources(
  store: Store,
  principal: SpeechPrincipal,
): ResponseOf<'listSpeechSources'> {
  const caller = speechToolCaller(store, principal);
  const cameras = readableCameras(store, principal);
  const plugins = store.speech.plugins().flatMap(([id, reader]) => {
    try {
      pluginReader(store, id);
      admitSpeechReadTool(store, principal, reader.readTool());
      reader.admit(caller);
      return [...reader.sources(caller)];
    } catch (cause) {
      logSpeechReadFailure(cause);
      return [];
    }
  });
  const chats = store.aiChats
    .chats({ profileId: principal.profileId, archived: false })
    .flatMap((chat) => {
      try {
        admitSpeechReadTool(store, principal, {
          name: 'read_chats',
          args: { view: 'messages', chatId: chat.id },
        });
        return [{ source: { kind: 'attachment' as const, chatId: chat.id }, label: chat.title }];
      } catch (cause) {
        logSpeechReadFailure(cause);
        return [];
      }
    });
  return {
    sources: [...cameras, ...plugins, ...chats],
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

function readableCameras(
  store: Store,
  principal: SpeechPrincipal,
): ResponseOf<'listSpeechSources'>['sources'] {
  return store.cameras.list().flatMap((camera) => {
    try {
      const scope = cameraSpeechScope(store, principal, camera.device_id);
      if (scope.kind !== 'camera')
        throw new ApiError('conflict', 'Expected the camera reader scope.');
      return [
        {
          source: { kind: 'camera' as const, deviceId: camera.device_id },
          label: store.devices.byId(camera.device_id).name,
        },
      ];
    } catch (cause) {
      logSpeechReadFailure(cause);
      return [];
    }
  });
}
