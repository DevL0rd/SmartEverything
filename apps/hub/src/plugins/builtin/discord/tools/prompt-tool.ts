import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { HubToolResult } from '../../../../ai-tools/hub-tool';
import type { PluginTool } from '../../contract';
import { definePluginTool } from '../../define';
import { attemptTool, WRITE_HINTS } from '../../tool-kit';
import { DiscordInputError } from '../errors';
import { PROMPT, PROMPT_OBJECT } from '../prompts';
import type { DiscordServices } from '../services';
import { EVENT_ID, IDEMPOTENCY_KEY } from './schema';

const WARNING_COLOR = 0xf0b232;

const INPUT = z.strictObject({
  eventId: EVENT_ID.unwrap().describe(
    'The eventId of the Discord request this question belongs to.',
  ),
  idempotencyKey: IDEMPOTENCY_KEY,
  ...PROMPT_OBJECT.shape,
});

export function promptTool(services: DiscordServices): PluginTool {
  return definePluginTool({
    name: 'prompt',
    title: 'Ask with buttons, a list or a form',
    description:
      'Send single-use buttons, a select list or a button that opens a form, bound to the person who asked. Their answer arrives as a new message in the same conversation.',
    input: INPUT,
    annotations: WRITE_HINTS,
    humanOnly: false,
    run: (input, caller): Promise<HubToolResult> =>
      attemptTool(async () => {
        const { eventId, idempotencyKey, ...asked } = input;
        const prompt = PROMPT.parse(asked);
        services.identity.assertReady();
        const { authority, flows, sender, journal } = services;
        const access = await authority.access(caller, eventId, true);
        if (access.origin === null) {
          throw new DiscordInputError('Prompts answer a Discord request: pass its eventId');
        }
        const { origin } = access;
        const key = idempotencyKey ?? randomUUID();
        return z.record(z.string(), z.unknown()).parse(
          await journal.execute(key, { operation: 'prompt', eventId, key, prompt }, async () => {
            const flow = flows.prepare(origin, prompt);
            const delivery =
              prompt.tone === 'warning'
                ? {
                    content: '',
                    embeds: [
                      { title: prompt.title, description: prompt.content, color: WARNING_COLOR },
                    ],
                    components: flow.components,
                  }
                : { content: prompt.content, components: flow.components };
            const posted = await sender.deliver(eventId, delivery, key);
            flows.bind(flow.id, posted.id);
            return { id: posted.id, flowId: flow.id, expiresAt: null };
          }),
        );
      }),
  });
}
