import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { HubToolResult } from '../../../../ai-tools/hub-tool';
import type { PluginTool } from '../../contract';
import { definePluginTool } from '../../define';
import { attemptTool, WRITE_HINTS } from '../../tool-kit';
import { readLocalFile } from '../media-service';
import type { OutFile } from '../outgoing';
import { REPLY_TOOL_NAME } from '../request';
import type { DiscordServices } from '../services';
import { boundedResult } from './action-runner';

const TEXT_LIMIT = 200_000;
const MAX_FILES = 10;

const REPLY = z.strictObject({
  eventId: z.uuid(),
  text: z.string().max(TEXT_LIMIT),
  progress: z.boolean().optional(),
  files: z
    .array(
      z.strictObject({ path: z.string().min(1).max(1000), name: z.string(), mime: z.string() }),
    )
    .max(MAX_FILES)
    .optional(),
  idempotencyKey: z.string().min(1).max(128).optional(),
});

export interface ReplyHooks {
  readonly answered: (eventId: string) => void;
}

async function attached(
  services: DiscordServices,
  files: NonNullable<z.output<typeof REPLY>['files']>,
  chatId: string | null,
): Promise<{ readonly files: OutFile[]; readonly notes: string[] }> {
  if (files.length === 0) {
    return { files: [], notes: [] };
  }
  services.media.assertEnabled();
  const sent: OutFile[] = [];
  const notes: string[] = [];
  for (const file of files) {
    try {
      sent.push(
        await readLocalFile(
          file.path,
          services.settings.media_max_file_bytes,
          services.sendRoots(chatId),
        ),
      );
    } catch (cause) {
      notes.push(
        `Could not attach ${file.name}: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }
  }
  return { files: sent, notes };
}

async function answer(
  services: DiscordServices,
  input: z.output<typeof REPLY>,
  chatId: string | null,
): Promise<Readonly<Record<string, unknown>>> {
  services.identity.assertReady();
  if (input.progress === true) {
    return boundedResult(
      await services.sender.respond({
        eventId: input.eventId,
        content: input.text,
        status: true,
        key: randomUUID(),
      }),
    );
  }
  const { files, notes } = await attached(services, input.files ?? [], chatId);
  const content = [input.text, ...notes].filter((part) => part !== '').join('\n\n');
  return boundedResult(
    await services.sender.send({
      eventId: input.eventId,
      content,
      files,
      idempotencyKey: input.idempotencyKey ?? randomUUID(),
    }),
  );
}

export function replyTool(services: DiscordServices, hooks: ReplyHooks): PluginTool {
  return definePluginTool({
    name: REPLY_TOOL_NAME,
    title: 'Post the answer to a Discord request',
    description:
      'Used by the hub to post the AI’s answer, or a working step, in the Discord conversation of a request.',
    input: REPLY,
    annotations: WRITE_HINTS,
    humanOnly: true,
    run: (input, caller): Promise<HubToolResult> =>
      attemptTool(async () => {
        try {
          return await answer(services, input, caller.chatId);
        } finally {
          if (input.progress !== true) {
            hooks.answered(input.eventId);
          }
        }
      }),
  });
}
