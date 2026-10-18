import { assistantNames } from '../assistant-voice/persona';
import { DeviceSpeech } from '../listening/device-speech';
import type { ListeningRegistry } from '../listening/listening-registry';
import { PhoneEars } from '../listening/phone-ears';
import { ListeningBudget } from '../transcripts/listening-budget';
import type { KeywordSpotter } from '../wake-name/keyword-spotter';
import type { Transcribing } from './transcribing';
import type { ReachWiring } from './reach-wiring';
import type { ServerContext } from './context';

export function startPhoneEars(
  context: ServerContext,
  parts: {
    readonly listening: ListeningRegistry;
    readonly transcribing: Pick<
      Transcribing,
      'ears' | 'claims' | 'transcriber' | 'transcripts' | 'wakeTest'
    >;
  },
  options: ReachWiring,
): PhoneEars {
  const { store } = context;
  const { listening, transcribing } = parts;
  const speech = new DeviceSpeech({
    source: 'phone',
    store,
    transcripts: transcribing.transcripts,
    transcriber: transcribing.transcriber,
    budget: new ListeningBudget({
      store,
      transcripts: transcribing.transcripts,
      clock: options.clock,
    }),
    keyPresent: (): boolean => context.openRouter.keys.current() !== null,
    names: (): string[] => assistantNames(store),
    paused: (deviceId, reason): void => {
      listening.setPaused(deviceId, reason);
    },
    clock: options.clock,
    log: options.log.forArea('hub.transcripts'),
  });
  const ears = new PhoneEars({
    store,
    registry: listening,
    claims: transcribing.claims,
    pause: transcribing.ears.pause,
    spotter: (): KeywordSpotter => transcribing.ears.spotter(),
    speech,
    test: transcribing.wakeTest,
    names: (): string[] => assistantNames(store),
    online: (): ReadonlySet<string> => context.live.connectedClients(),
    send: (clientId, notice): void => {
      context.live.toClient(clientId, notice);
    },
    log: options.log.forArea('hub.listening'),
  });
  ears.start();
  return ears;
}
