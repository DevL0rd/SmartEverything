import type { z } from 'zod';
import type { AI_AGENT_RUN_CONTROL, AiAgentRun, AiChatRow, Engine } from '@smarteverything/domain';
import type { ComputerRunner } from './engines/computer/runner';
import type { Store } from '../store/store';
import { controlAgent } from './coordination/controls';
export class ComputerProviders extends Map<'claude' | 'codex', ComputerRunner> {
  bindingChanged(chat: AiChatRow, engine: Engine): Promise<void> {
    if (chat.engine.kind === 'openrouter' || chat.engine.kind === 'dsh') return Promise.resolve();
    return this.get(chat.engine.kind)?.bindingChanged(chat, engine) ?? Promise.resolve();
  }
  controlRun(
    ports: { readonly store: Store; readonly interrupt: (chat: AiChatRow) => Promise<void> },
    run: AiAgentRun,
    control: z.infer<typeof AI_AGENT_RUN_CONTROL>,
  ): Promise<void> {
    return controlAgent({ ...ports, computer: (runtime) => this.get(runtime) }, run, control);
  }
}
