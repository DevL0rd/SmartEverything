import type { ToolAction, WakeAiAction } from '@smarteverything/domain';
import type { ActionOrigin } from './actions';

interface AutomationAi {
  readonly wake: (action: WakeAiAction, origin: ActionOrigin) => Promise<void>;
  readonly tool: (action: ToolAction, origin: ActionOrigin) => Promise<void>;
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
