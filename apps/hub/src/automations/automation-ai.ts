import type { PluginOrigin, SignalInput, WakeAiAction } from '@smarteverything/domain';
import type { ToolHub } from '../ai-tools/tool-hub';

export interface ActionOrigin {
  readonly automationId: string;
  readonly name: string;
  readonly signal: SignalInput | null;
  readonly plugin: PluginOrigin | null;
}

interface AutomationAi {
  readonly wake: (action: WakeAiAction, origin: ActionOrigin) => Promise<void>;
  readonly tools: Pick<ToolHub, 'check' | 'call'>;
  readonly stop: () => void;
}

class AiNotReadyError extends Error {
  override readonly name = 'AiNotReadyError';

  constructor() {
    super('The AI isn’t running on this server yet, so this step couldn’t run.');
  }
}

export class AutomationAiSlot {
  private ai: AutomationAi | null = null;

  attach(ai: AutomationAi): void {
    this.ai?.stop();
    this.ai = ai;
  }

  stop(): void {
    this.ai?.stop();
    this.ai = null;
  }

  current(): AutomationAi {
    if (this.ai === null) {
      throw new AiNotReadyError();
    }
    return this.ai;
  }
}
