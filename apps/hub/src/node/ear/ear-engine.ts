import type { Model } from '@ricky0123/vad-web/dist/models/common.js';
import { sileroModel } from '../../assistant-voice/silero-vad';
import { WakeKeywords } from '../../wake-name/keyword-lines';
import type { EarRuntimeLost } from './runtime-lost';
import { KeywordSpotter } from './keyword-spotter';
import type { KeywordEngine } from './relayed-spotter';

const PROBE_NAME = 'Jarvis';
const PROBE_LABEL = 'probe';

export class EarEngineError extends Error {
  override readonly name = 'EarEngineError';
}

export interface EarEngineParts {
  readonly spotter: () => KeywordEngine;
  readonly model: () => Promise<Model>;
  readonly lost?: EarRuntimeLost;
}

export class EarEngine {
  private keywords: KeywordEngine | null = null;
  private loading: Promise<void> | null = null;

  constructor(private readonly parts: EarEngineParts) {}

  spotter(): KeywordEngine {
    this.keywords ??= this.parts.spotter();
    return this.keywords;
  }

  readonly model = (): Promise<Model> => this.parts.model();

  get lost(): EarRuntimeLost | undefined {
    return this.parts.lost;
  }

  load(): Promise<void> {
    this.loading ??= this.probe().catch((cause: unknown) => {
      this.loading = null;
      throw cause;
    });
    return this.loading;
  }

  private async probe(): Promise<void> {
    const spotter = this.spotter();
    const { keywords, threshold } = new WakeKeywords().earConfig([PROBE_NAME], 'standard');
    const listening = spotter.listenKeywords(keywords.join('\n'), threshold, PROBE_LABEL);
    if (listening === null) {
      throw new EarEngineError(
        `The wake word spotter built no keywords for ${PROBE_NAME}; expected at least one`,
      );
    }
    listening.free();
    spotter.free();
    const model = await this.model();
    await model.release();
  }
}

export function wakeEarEngine(lost?: EarRuntimeLost): EarEngine {
  return new EarEngine({
    spotter: () => new KeywordSpotter(),
    model: sileroModel,
    ...(lost === undefined ? {} : { lost }),
  });
}
