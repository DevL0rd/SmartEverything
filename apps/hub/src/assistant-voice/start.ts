import type { Logger } from '@smarteverything/logging';
import type { AssistantService } from '../assistant/service';
import type { SecretStore } from '../secrets/store';
import type { Store } from '../store/store';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { PriceBook } from '../ledger/gemini-live';
import { AssistantVoice } from './assistant-voice';

export interface StartVoiceOptions {
  readonly store: Store;
  readonly secrets: SecretStore;
  readonly assistant: AssistantService;
  readonly fetch: typeof fetch;
  readonly now: () => Date;
  readonly tools: ToolHub;
  readonly prices: PriceBook;
  readonly log: Logger;
}

export function startAssistantVoice(options: StartVoiceOptions): AssistantVoice {
  const voice = new AssistantVoice({
    store: options.store,
    secrets: options.secrets,
    responder: options.assistant.voice,
    tools: options.tools,
    prices: options.prices,
    fetch: options.fetch,
    now: options.now,
    log: options.log,
  });
  options.assistant.onVoiceResult((eventId, text, progress) =>
    voice.result(eventId, text, progress),
  );
  return voice;
}
