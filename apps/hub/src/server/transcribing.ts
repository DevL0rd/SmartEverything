import type { AssistantVoice } from '../assistant-voice/assistant-voice';
import type { HostedCall } from '../assistant-voice/outreach';
import type { TurnSession } from '../assistant-voice/turn-session';
import { assistantNames } from '../assistant-voice/persona';
import type { PluginVoiceServices } from '../plugins/plugin-voice';
import { CameraListening } from '../transcripts/camera-listening';
import { GeminiTranscription, Transcriber } from '../transcripts/transcriber';
import { Transcripts } from '../transcripts/transcript-service';
import { Ears } from '../wake-name/ear';
import { WakeClaims } from '../wake-name/wake-claims';
import type { BuildOptions } from './build';
import type { ServerContext } from './context';

export interface Transcribing {
  readonly transcripts: Transcripts;
  readonly listening: CameraListening;
  readonly ears: Ears;
  readonly claims: WakeClaims;
  readonly transcriber: Transcriber;
  readonly plugins: PluginVoiceServices;
}

export function startTranscribing(
  options: BuildOptions,
  context: ServerContext,
  voice: AssistantVoice,
): Transcribing {
  const { store, clock } = options;
  const log = options.log.forArea('hub.transcripts');
  const names = (): string[] => assistantNames(store);
  const transcripts = new Transcripts({ store, clock, log });
  transcripts.start();
  const transcriber = new Transcriber({
    provider: new GeminiTranscription(() => voice.keys.current()),
    ledger: store.ledger,
    prices: context.openRouter.catalogue,
    log,
  });
  const claims = new WakeClaims({ clock, log: options.log.forArea('hub.wake-name') });
  const ears = new Ears({ claims, names, clock, log: options.log.forArea('hub.wake-name') });
  const listening = new CameraListening({
    store,
    transcripts,
    transcriber,
    ready: (cameraId): Promise<void> => options.core.hub.streamReady(cameraId),
    keyPresent: (): boolean => voice.keys.current() !== null,
    inConversation: (cameraId): boolean =>
      store.aiOutreach.open().some((row) => row.how === 'camera' && row.target === cameraId),
    names,
    clock,
    log,
  });
  const plugins: PluginVoiceServices = {
    store,
    host: (request): Promise<HostedCall> => voice.host(request),
    turn: (request): Promise<TurnSession> => voice.turn(request),
    chat: (profileId, title, source): string =>
      (source === null
        ? context.assistant.chats.conversationChat(profileId, title)
        : context.assistant.chats.chatForPlugin(profileId, source, title)
      ).id,
    keys: { changes: (listener) => voice.keys.changes(listener) },
    ears,
    transcripts,
    transcriber,
    names,
    keyPresent: (): boolean => voice.keys.current() !== null,
    clock,
    log,
  };
  return { transcripts, listening, ears, claims, transcriber, plugins };
}
