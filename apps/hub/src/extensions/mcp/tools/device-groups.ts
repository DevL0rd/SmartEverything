import { API_ENDPOINTS as E, TARGET_CHANGE } from '@smarteverything/domain';
import { submitAndWait } from '../command-waiter';
import { operate } from './acting';
import { reported } from './commanding';
import { defineTool, PHYSICAL, type Tool } from './registry';

export const DEVICE_GROUP_TOOLS: readonly Tool[] = [
  defineTool({
    name: 'control_device_target',
    input: TARGET_CHANGE,
    annotations: PHYSICAL,
    run: async (context, input) => {
      let skipped: readonly { readonly deviceId: string; readonly reason: string }[] = [];
      const outcome = await submitAndWait({
        feed: context.store.feed,
        clock: context.clock,
        waitMs: context.commandWaitMs,
        submit: async () => {
          const result = E.sendTargetCommands.response.parse(
            await operate(context, 'sendTargetCommands', { body: input }),
          );
          skipped = result.skipped;
          return result.commands;
        },
        current: (id) => context.store.commands.byId(id),
      });
      return { structured: { ...reported(context, outcome), skipped } };
    },
  }),
];
