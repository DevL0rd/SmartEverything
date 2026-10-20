import type { Logger } from '@smarteverything/logging';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { Clock } from '../clock';
import { WakeRunner } from '../wake/wake-runner';
import type { ServerContext } from './context';

export interface AutomationAiWiring {
  readonly clock: Clock;
  readonly log: Logger;
}

export function attachAutomationAi(
  context: ServerContext,
  tools: ToolHub,
  options: AutomationAiWiring,
): void {
  const wakes = new WakeRunner({
    store: context.store,
    turns: {
      run: (input): { readonly chatId: string } =>
        context.assistant.runTurn({
          profileId: input.profileId,
          ...(input.chatId === null ? {} : { chatId: input.chatId }),
          title: input.title,
          text: input.text,
          origin: {
            source: 'wake',
            plugin_id: null,
            device_id: null,
            name: input.title,
            ...(input.plugin ?? {}),
          },
        }),
    },
    clock: options.clock,
    log: options.log.forArea('hub.wake'),
  });
  context.hub.automationAi.attach({
    wake: (action, origin) => wakes.wake(action, origin),
    tools,
    stop: (): void => {
      wakes.stop();
    },
  });
}
