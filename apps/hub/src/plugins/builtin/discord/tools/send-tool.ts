import { messageOf } from '@smarteverything/logging';
import { z } from 'zod';
import type { HubToolResult, ToolCaller } from '../../../../ai-tools/hub-tool';
import type { PluginFiles, PluginTool } from '../../contract';
import { definePluginTool } from '../../define';
import { attemptTool, WRITE_HINTS } from '../../tool-kit';
import { CONTENT, EMBEDS } from '../embeds';
import { DiscordInputError } from '../errors';
import { SNOWFLAKE } from '../ids';
import { mimeOf, safeFileName } from '../media-download';
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

const RUN_FILE = z.strictObject({
  attachment: z
    .string()
    .min(1)
    .describe('The id of a file that was attached to a chat with the assistant.'),
});

type RunFile = z.output<typeof RUN_FILE>;

export type RunFileReader = PluginFiles['fromUpload'];

export type SendServices = Pick<
  DiscordServices,
  'download' | 'machineFile' | 'uploadFile' | 'pictureFile'
> & {
  readonly settings: Pick<DiscordServices['settings'], 'media_max_file_bytes'>;
  readonly identity: Pick<DiscordServices['identity'], 'assertReady'>;
  readonly authority: Pick<DiscordServices['authority'], 'access'>;
  readonly directory: Pick<DiscordServices['directory'], 'resolve'>;
  readonly sender: Pick<DiscordServices['sender'], 'send'>;
  readonly media: Pick<DiscordServices['media'], 'assertEnabled'>;
};

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
    .array(z.union([SEND_FILE, RUN_FILE]))
    .max(MAX_FILES)
    .default([])
    .describe(
      'Up to 10 files or images from any source: { path, machine? } an absolute file path on the home hub’s machine or, with machine (name or id from machine_read), on that computer, { url } an http(s) download, { name, text } or { name, base64 } inline content, { attachment } the id of a chat attachment. Discord limits apply: the plugin’s per-file size setting and 25 MiB in total per message.',
    ),
  picture: z
    .string()
    .min(1)
    .optional()
    .describe(
      'The id of one picture an automation run made (the picture of a camera snapshot or of a generated image), sent along with the files.',
    ),
  pictures: z
    .array(z.string().min(1))
    .default([])
    .describe('The ids of several pictures an automation run made, sent along with the files.'),
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
  services: SendServices,
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

interface RunSource {
  readonly what: string;
  readonly id: string;
  readonly read: RunFileReader;
}

async function runFile(
  services: SendServices,
  { what, id, read }: RunSource,
  caller: ToolCaller,
): Promise<OutFile> {
  const found = await read(caller, id).catch((cause: unknown) => {
    throw new DiscordInputError(`Could not read the ${what} ${id}: ${messageOf(cause)}`);
  });
  if (found === null) {
    throw new DiscordInputError(`The ${what} ${id} does not exist or is not yours`);
  }
  const max = services.settings.media_max_file_bytes;
  const name = safeFileName(found.name);
  if (found.data.length > max) {
    throw new DiscordInputError(
      `${name} is larger than the ${String(Math.round(max / 1024))} KiB file limit in the plugin settings`,
    );
  }
  return { data: found.data, name, contentType: await mimeOf(found.data, null) };
}

function oneFile(
  services: SendServices,
  file: SendFile | RunFile,
  caller: ToolCaller,
): Promise<OutFile> {
  const max = services.settings.media_max_file_bytes;
  if ('attachment' in file) {
    return runFile(
      services,
      { what: 'attachment', id: file.attachment, read: services.uploadFile },
      caller,
    );
  }
  if ('path' in file) {
    return pathOnMachine(services, file, caller);
  }
  if ('url' in file) {
    return urlFile(file.url, file.name, max, services.download);
  }
  return inlineFile(file, max);
}

function pictureIds(input: Pick<z.output<typeof SEND>, 'picture' | 'pictures'>): string[] {
  return input.picture === undefined ? input.pictures : [input.picture, ...input.pictures];
}

async function filesOf(
  services: SendServices,
  input: Pick<z.output<typeof SEND>, 'files' | 'picture' | 'pictures'>,
  caller: ToolCaller,
): Promise<OutFile[]> {
  const pictures = pictureIds(input);
  if (input.files.length === 0 && pictures.length === 0) {
    return [];
  }
  services.media.assertEnabled();
  const files = await Promise.all([
    ...input.files.map((file) => oneFile(services, file, caller)),
    ...pictures.map((id) =>
      runFile(services, { what: 'picture', id, read: services.pictureFile }, caller),
    ),
  ]);
  assertTotal(files);
  return files;
}

function assertProgressAlone(input: z.output<typeof SEND>, away: boolean): void {
  if (
    input.progress === true &&
    (away || input.files.length > 0 || pictureIds(input).length > 0 || input.embeds !== undefined)
  ) {
    throw new DiscordInputError('progress needs only eventId and text');
  }
}

async function send(
  services: SendServices,
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
    files: await filesOf(services, input, caller),
    notifyUserId: notify,
    progress: input.progress,
  });
  return boundedResult(result);
}

export function sendTool(services: SendServices): PluginTool {
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
