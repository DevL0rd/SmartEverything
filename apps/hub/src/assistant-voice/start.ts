import type { Logger } from '@smarteverything/logging';
import type { AssistantService } from '../assistant/service';
import type { SecretStore } from '../secrets/store';
import type { Store } from '../store/store';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { Budget } from '../ledger/budget';
import type { PriceBook } from '../ledger/gemini-live';
import { AssistantVoice } from './assistant-voice';
import type { HomeCameras } from './home-cameras';
import type { OpenCalls } from './open-calls';
import type { SpeakingMedia } from '../reach/room-media';

export interface StartVoiceOptions {
  readonly store: Store;
  readonly secrets: SecretStore;
  readonly assistant: AssistantService;
  readonly fetch: typeof fetch;
  readonly now: () => Date;
  readonly tools: ToolHub;
  readonly prices: PriceBook;
  readonly openCalls: OpenCalls;
  readonly cameras: HomeCameras;
  readonly roomMedia: SpeakingMedia;
  readonly dataDirectory: string;
  readonly log: Logger;
}

export function startAssistantVoice(options: StartVoiceOptions): AssistantVoice {
  const voice = new AssistantVoice({
    store: options.store,
    secrets: options.secrets,
    responder: options.assistant.voice,
    tools: options.tools,
    prices: options.prices,
    cameras: options.cameras,
    roomMedia: options.roomMedia,
    dataDirectory: options.dataDirectory,
    fetch: options.fetch,
    now: options.now,
    log: options.log,
  });
  options.openCalls.attach((callMessageId) => voice.callOpen(callMessageId));
  options.assistant.onVoiceResult((eventId, text, progress) =>
    voice.result(eventId, text, progress),
  );
  return voice;
}

export function followBudget(
  voice: AssistantVoice,
  budget: Pick<Budget, 'exhausted' | 'on'>,
): void {
  voice.attachBudget({ reason: () => budget.exhausted() });
  budget.on((alert) => {
    if (alert.key.endsWith(':full')) {
      voice.sightCalls.budgetReached(alert.title);
    }
  });
}
