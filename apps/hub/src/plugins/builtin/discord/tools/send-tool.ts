import { z } from 'zod';
import type { HubToolResult, ToolCaller } from '../../../../ai-tools/hub-tool';
import type { PluginTool } from '../../contract';
import { definePluginTool } from '../../define';
import { attemptTool, WRITE_HINTS } from '../../tool-kit';
import { CONTENT, EMBEDS } from '../embeds';
import { DiscordInputError } from '../errors';
import { SNOWFLAKE } from '../ids';
import {
  assertTotal,
  inlineFile,
  machineFile,
  MAX_FILES,
  pathFile,
  SEND_FILE,
  urlFile,
  type SendFile,
} from '../outgoing-files';
import type { OutFile } from '../outgoing';
import type { DiscordServices } from '../services';
import { boundedResult } from './action-runner';
import { EVENT_ID, USER_REF } from './schema';

const SEND = z.strictObject({
  eventId: EVENT_ID,
  channelId: SNOWFLAKE.optional().describe(
    'Post in this server channel or thread instead of replying to the request. Any channel the bot may respond in.',
  ),
  userId: USER_REF.optional().describe(
    'Or send a direct message to this approved person (ID or exact name).',
  ),
  content: CONTENT.default('').describe(
    'Message text, optional when embeds or files are given. Text over 2000 characters is sent as several messages split at paragraphs.',
  ),
  embeds: EMBEDS.optional().describe(
    'Discord embeds for structured, non-conversational output: reports, results, lists, status. Keep normal chat as plain content.',
  ),
  files: z
    .array(SEND_FILE)
    .max(MAX_FILES)
    .default([])
    .describe(
      'Up to 10 files or images from any source: { path, machine? } an absolute file path on the home hub’s machine or, with machine (name or id from machine_read), on that computer, { url } an http(s) download, { name, text } or { name, base64 } inline content. Discord limits apply: the plugin’s per-file size setting and 25 MiB in total per message.',
    ),
  notify: USER_REF.optional().describe(
    'Ping this approved person. In a reply, only the person who asked can be pinged. Roles and everyone are never pinged.',
  ),
  progress: z
    .boolean()
    .optional()
    .describe(
      'A short status update for a request ("On it, checking the logs..."). Updates appear as a status section under your last reply, which is removed when you send the answer.',
    ),
});

async function pathOnMachine(
  services: DiscordServices,
  file: { readonly machine?: string | undefined; readonly path: string },
  caller: ToolCaller,
): Promise<OutFile> {
  const max = services.settings.media_max_file_bytes;
  if (file.machine === undefined) return pathFile(file.path, max);
  const { machine, path } = { machine: file.machine, path: file.path };
  const fetched = await machineFile(
    { machine, path },
    () => services.machineFile(caller, { machine, path }),
    max,
  );
  return fetched ?? pathFile(path, max);
}

function oneFile(services: DiscordServices, file: SendFile, caller: ToolCaller): Promise<OutFile> {
  const max = services.settings.media_max_file_bytes;
  if ('path' in file) {
    return pathOnMachine(services, file, caller);
  }
  if ('url' in file) {
    return urlFile(file.url, file.name, max, services.download);
  }
  return inlineFile(file, max);
}

async function filesOf(
  services: DiscordServices,
  list: readonly SendFile[],
  caller: ToolCaller,
): Promise<OutFile[]> {
  if (list.length === 0) {
    return [];
  }
  services.media.assertEnabled();
  const files = await Promise.all(list.map((file) => oneFile(services, file, caller)));
  assertTotal(files);
  return files;
}

function assertProgressAlone(input: z.output<typeof SEND>, away: boolean): void {
  if (input.progress === true && (away || input.files.length > 0 || input.embeds !== undefined)) {
    throw new DiscordInputError('progress needs only eventId and text');
  }
}

async function send(
  services: DiscordServices,
  input: z.output<typeof SEND>,
  caller: ToolCaller,
): Promise<Readonly<Record<string, unknown>>> {
  services.identity.assertReady();
  const away = input.channelId !== undefined || input.userId !== undefined;
  if (input.eventId === undefined && !away) {
    throw new DiscordInputError(
      'Pass eventId to reply to a request, or channelId or userId to write somewhere',
    );
  }
  if (input.channelId !== undefined && input.userId !== undefined) {
    throw new DiscordInputError('Choose one of channelId and userId');
  }
  assertProgressAlone(input, away);
  await services.authority.access(caller, input.eventId);
  const userId =
    input.userId === undefined ? undefined : await services.directory.resolve(input.userId);
  const notify =
    input.notify === undefined ? undefined : await services.directory.resolve(input.notify);
  const result = await services.sender.send({
    eventId: away ? undefined : input.eventId,
    channelId: input.channelId,
    userId,
    content: input.content,
    embeds: input.embeds,
    files: await filesOf(services, input.files, caller),
    notifyUserId: notify,
    progress: input.progress,
  });
  return boundedResult(result);
}

export function sendTool(services: DiscordServices): PluginTool {
  return definePluginTool({
    name: 'send',
    title: 'Send a Discord message',
    description:
      'Send text, embeds and files in Discord. Files can come from anywhere: any local path, an http(s) URL, or inline text or base64. With only eventId it replies in the conversation of that request. Add channelId to post in a server channel or thread, or userId to message an approved person directly. Everyone who is allowed may leave eventId out when giving channelId or userId. Your final answer to a request is posted for you, so use this for extra messages, files or other places. Pass progress: true with only eventId for a short status update while you work.',
    input: SEND,
    annotations: WRITE_HINTS,
    humanOnly: false,
    run: (input, caller): Promise<HubToolResult> =>
      attemptTool(() => send(services, input, caller)),
  });
}
