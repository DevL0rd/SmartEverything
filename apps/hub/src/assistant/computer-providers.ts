import type { z } from 'zod';
import type { AI_AGENT_RUN_CONTROL, AiAgentRun, AiChatRow, Engine } from '@smarteverything/domain';
import type { ComputerRunner } from './engines/computer/runner';
import type { Store } from '../store/store';
import { controlAgent } from './coordination/controls';
import { computerEngine } from './engine-kind';
export class ComputerProviders extends Map<'claude' | 'codex', ComputerRunner> {
  bindingChanged(chat: AiChatRow, engine: Engine): Promise<void> {
    const bound = computerEngine(chat.engine);
    return bound === null
      ? Promise.resolve()
      : (this.get(bound.kind)?.bindingChanged(chat, engine) ?? Promise.resolve());
  }
  controlRun(
    ports: { readonly store: Store; readonly interrupt: (chat: AiChatRow) => Promise<void> },
    run: AiAgentRun,
    control: z.infer<typeof AI_AGENT_RUN_CONTROL>,
  ): Promise<void> {
    return controlAgent({ ...ports, computer: (runtime) => this.get(runtime) }, run, control);
  }
}
