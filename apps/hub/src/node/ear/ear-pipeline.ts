import type { Model } from '@ricky0123/vad-web/dist/models/common.js';
import type { ListeningConfig, PauseChoiceMs, WakeSensitivity } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { sileroModel } from '../../assistant-voice/silero-vad';
import type { Clock } from '../../clock';
import type { SpeechSegment } from '../../listening/speech-segment';
import { Ear } from './ear';
import { GrantedClaims } from './ear-audio';
import { KeywordSpotter } from './keyword-spotter';
import { RelayedSpotter } from './relayed-spotter';
import type { EarRuntimeLost } from './runtime-lost';

const CLAIMANT = { source: 'computer', key: 'node' } as const;
const FIELDS = { source: 'computer' } as const;

export interface EarClaim {
  readonly phrase: string;
  readonly snippetDbfs: number;
  readonly words: Int16Array;
}

export interface EarPipelineHandlers {
  readonly claimed: (claim: EarClaim) => void;
  readonly segment: (segment: SpeechSegment) => void;
  readonly failed: (reason: string) => void;
}

export interface EarPipeline {
  readonly hear: (pcm: Int16Array) => void;
  readonly close: () => Promise<void>;
}

export type EarPipelineFactory = (
  config: ListeningConfig,
  handlers: EarPipelineHandlers,
) => Promise<EarPipeline>;

export interface LocalEarPipelineDeps {
  readonly clock: Pick<Clock, 'now' | 'at'>;
  readonly log: Logger;
  readonly model?: () => Promise<Model>;
  readonly lost?: EarRuntimeLost;
}

export function localEarPipeline(deps: LocalEarPipelineDeps): EarPipelineFactory {
  return async (config, handlers): Promise<EarPipeline> => {
    const engine = new KeywordSpotter();
    const grants = new GrantedClaims();
    const ear = new Ear(
      {
        claims: grants.claims,
        spotter: new RelayedSpotter(engine, config, false),
        model: deps.model ?? sileroModel,
        pauseMs: (): PauseChoiceMs => config.pause_ms,
        clock: deps.clock,
        log: deps.log,
        ...(deps.lost === undefined ? {} : { lost: deps.lost }),
      },
      {
        claim: CLAIMANT,
        fields: FIELDS,
        sensitivity: (): WakeSensitivity => config.sensitivity,
        resting: (): boolean => false,
        wakes: (): boolean => config.wake,
        wake: (phrase, words): void => {
          handlers.claimed({ phrase, snippetDbfs: grants.level, words: words() });
        },
        speech: config.transcribe ? handlers.segment : null,
      },
    );
    try {
      await ear.open();
    } catch (cause) {
      await ear.close();
      engine.free();
      throw cause;
    }
    return {
      hear: (pcm): void => {
        ear.hear(pcm);
      },
      close: async (): Promise<void> => {
        await ear.close();
        engine.free();
      },
    };
  };
}
