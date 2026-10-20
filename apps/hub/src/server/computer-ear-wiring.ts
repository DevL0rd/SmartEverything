import { assistantNames } from '../assistant-voice/persona';
import { ComputerEars, type DiscordVoice } from '../computers/computer-ears';
import { wakeComputer } from '../computers/computer-wake';
import type { EarsRelay } from '../computers/ears-relay';
import { DeviceSpeech } from '../listening/device-speech';
import type { ListeningRegistry } from '../listening/listening-registry';
import type { ReachService } from '../reach/reach-service';
import type { EarKeywords } from '../wake-name/keyword-lines';
import { ListeningBudget } from '../transcripts/listening-budget';
import type { ServerContext } from './context';
import type { ReachWiring } from './reach-wiring';
import type { Transcribing } from './transcribing';

export interface StartedComputerEars {
  readonly stop: () => void;
}

interface Parts {
  readonly listening: ListeningRegistry;
  readonly transcribing: Pick<
    Transcribing,
    'pause' | 'keywords' | 'claims' | 'transcriber' | 'transcripts' | 'wakeTest'
  >;
  readonly service: Pick<ReachService, 'computer' | 'hangUp'>;
  readonly relay: EarsRelay;
  readonly discord: DiscordVoice;
}

function speechOf(context: ServerContext, parts: Parts, options: ReachWiring): DeviceSpeech {
  const { store } = context;
  const { listening, transcribing } = parts;
  return new DeviceSpeech({
    source: 'computer',
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
}

export function startComputerEars(
  context: ServerContext,
  parts: Parts,
  options: ReachWiring,
): StartedComputerEars {
  const { store } = context;
  const { listening, transcribing, service, relay, discord } = parts;
  const log = options.log.forArea('hub.listening');
  const ears = new ComputerEars({
    registry: listening,
    claims: transcribing.claims,
    pause: transcribing.pause,
    speech: speechOf(context, parts, options),
    test: transcribing.wakeTest,
    discord,
    keywords: (sensitivity): EarKeywords =>
      transcribing.keywords.earConfig(assistantNames(store), sensitivity),
    wake: (computerId, phrase, heard, onSuperseded): Promise<void> =>
      wakeComputer({ store, service, log }, { computerId, phrase, heard }, onSuperseded),
    log,
  });
  ears.start();
  relay.bind(ears);
  return {
    stop: (): void => {
      ears.stop();
    },
  };
}
