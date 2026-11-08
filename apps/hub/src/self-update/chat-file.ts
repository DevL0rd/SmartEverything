import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { constants, createReadStream, createWriteStream } from 'node:fs';
import {
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  statfs,
  writeFile,
} from 'node:fs/promises';
import { basename, isAbsolute, join, relative } from 'node:path';
import { pipeline } from 'node:stream/promises';
import {
  ApiError,
  ASSISTANT_ATTACHMENT_BYTES_MAX,
  buildPath,
  type AiChatRow,
} from '@smarteverything/domain';
import { z } from 'zod';
import { ConversationLog } from '../assistant/conversation-log';
import { attachmentMimeOf, type AssistantFiles } from '../assistant/files';
import { within } from '../assistant/out-file-path';
import { outputAuthority } from '../assistant/turn-authority';
import { isMissing } from '../fs-util';
import type { HubLayout } from '../data-layout';
import { chatFolder } from '../projects/paths';
import type { RawRoute } from '../server/http-server';
import { serveBytes } from '../server/file-serve';
import type { Store } from '../store/store';

const DOWNLOAD_PATH = '/api/self-update-download/:ticket';
const DOWNLOAD_LIFETIME_MS = 4 * 60 * 60 * 1000;
const TOKEN_BYTES = 32;
const TOKEN = z.string().regex(/^[a-f0-9]{64}$/u);
const DIGEST = /^[a-f0-9]{64}$/u;
const DOWNLOAD = z.strictObject({
  runId: z.uuid(),
  chatId: z.uuid(),
  name: z.string().min(1),
  what: z.string().min(1),
  bytes: z.int().positive(),
  expiresAt: z.iso.datetime(),
});

type Download = z.infer<typeof DOWNLOAD>;

interface ChatFileInput {
  readonly layout: HubLayout;
  readonly chat: AiChatRow;
  readonly path: string;
  readonly name?: string | undefined;
  readonly what: string;
}

const SOURCE_FLAGS = constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW;

function deliveryRoot(layout: HubLayout): string {
  return join(layout.system.updates.selfUpdate, 'downloads');
}

function digest(ticket: string): string {
  return createHash('sha256').update(ticket).digest('hex');
}

async function entryOf(directory: string): Promise<Download | null> {
  try {
    return DOWNLOAD.parse(JSON.parse(await readFile(join(directory, 'download.json'), 'utf8')));
  } catch (cause) {
    if (isMissing(cause)) return null;
    throw cause;
  }
}

async function forgetExpired(root: string, now: Date): Promise<void> {
  for (const name of await readdir(root)) {
    if (!DIGEST.test(name)) continue;
    const directory = join(root, name);
    const entry = await entryOf(directory);
    if (entry !== null && Date.parse(entry.expiresAt) <= now.getTime())
      await rm(directory, { recursive: true, force: true });
  }
}

async function requireSpace(directory: string, layout: HubLayout, bytes: number): Promise<void> {
  const disk = await statfs(directory);
  const database = await stat(layout.system.database.file);
  if (disk.bavail * disk.bsize - database.size < bytes)
    throw new ApiError('conflict', 'There is not enough space to prepare the download safely.');
}

async function approvedSource(input: ChatFileInput): Promise<string> {
  if (!isAbsolute(input.path))
    throw new ApiError('invalid_request', 'Give the absolute path to the file.');
  const real = await realpath(input.layout.root);
  const chat = chatFolder(input.layout, input.chat);
  const allowed = [
    join(chat, 'workspace'),
    join(chat, 'temporary'),
    join(input.layout.system.updates.selfUpdate, 'artifacts'),
  ].map((directory) => join(real, relative(input.layout.root, directory)));
  const path = await realpath(input.path);
  if (!allowed.some((directory) => within(path, directory)))
    throw new ApiError(
      'forbidden',
      'Send a file from this chat’s workspace or a staged release artifact.',
    );
  return path;
}

async function keepFile(path: string, directory: string, layout: HubLayout): Promise<number> {
  const file = await open(path, SOURCE_FLAGS);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size === 0)
      throw new ApiError('invalid_request', 'Choose a nonempty, regular file to send.');
    await requireSpace(directory, layout, info.size);
    await pipeline(
      file.createReadStream({ autoClose: false, end: info.size - 1 }),
      createWriteStream(join(directory, 'content'), { mode: 0o600, flags: 'wx' }),
    );
    const [kept, after] = await Promise.all([stat(join(directory, 'content')), file.stat()]);
    if (kept.size !== info.size || after.size !== info.size || after.ctimeMs !== info.ctimeMs)
      throw new ApiError('conflict', 'The file changed while it was being prepared. Try again.');
    return info.size;
  } finally {
    await file.close();
  }
}

export async function sendChatFile(
  input: ChatFileInput & { readonly publicUrl: string },
  now = new Date(),
): Promise<Download & { readonly downloadUrl: string }> {
  const origin = new URL(input.publicUrl);
  if (origin.protocol !== 'https:' || origin.username !== '' || origin.password !== '')
    throw new ApiError('invalid_request', 'Set and verify a public HTTPS hub address first.');
  const source = await approvedSource(input);
  const root = deliveryRoot(input.layout);
  const ticket = randomBytes(TOKEN_BYTES).toString('hex');
  const runId = randomUUID();
  const temporary = join(root, `stage-${runId}`);
  await mkdir(root, { recursive: true, mode: 0o700 });
  await forgetExpired(root, now);
  await mkdir(temporary, { mode: 0o700 });
  try {
    const entry = DOWNLOAD.parse({
      runId,
      chatId: input.chat.id,
      name: input.name ?? basename(input.path),
      what: input.what,
      bytes: await keepFile(source, temporary, input.layout),
      expiresAt: new Date(now.getTime() + DOWNLOAD_LIFETIME_MS).toISOString(),
    });
    await writeFile(join(temporary, 'download.json'), JSON.stringify(entry), { mode: 0o600 });
    await rename(temporary, join(root, digest(ticket)));
    const downloadUrl = new URL(buildPath(DOWNLOAD_PATH, { ticket }), origin).href;
    return { ...entry, downloadUrl };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function sendChatFileLinkToChat(
  store: Store,
  input: ChatFileInput & { readonly publicUrl: string },
  now = new Date(),
): ReturnType<typeof sendChatFile> {
  const delivery = await sendChatFile(input, now);
  new ConversationLog(store).responderInChat({
    chat: store.aiChats.chat(input.chat.id),
    replyTo: null,
    messageId: delivery.runId,
    kind: 'update',
    text: `${delivery.what}\n\n[Download file](${delivery.downloadUrl}) · Available for four hours.`,
  });
  return delivery;
}

async function readAttachmentSource(path: string): Promise<Buffer> {
  const file = await open(path, SOURCE_FLAGS);
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size === 0)
      throw new ApiError('invalid_request', 'Choose a nonempty, regular file to send.');
    if (info.size > ASSISTANT_ATTACHMENT_BYTES_MAX)
      throw new ApiError(
        'invalid_request',
        `Chat attachments are limited to ${String(ASSISTANT_ATTACHMENT_BYTES_MAX / (1024 * 1024))} MB. Request a download link for a larger file.`,
      );
    const content = Buffer.alloc(info.size);
    let offset = 0;
    while (offset < content.length) {
      const { bytesRead } = await file.read(content, offset, content.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    const after = await file.stat();
    if (offset !== info.size || after.size !== info.size || after.ctimeMs !== info.ctimeMs)
      throw new ApiError('conflict', 'The file changed while it was being prepared. Try again.');
    return content;
  } finally {
    await file.close();
  }
}

export async function sendChatFileToChat(
  store: Store,
  files: AssistantFiles,
  input: ChatFileInput,
): Promise<{
  readonly messageId: string;
  readonly attachmentId: string;
  readonly name: string;
  readonly mime: string;
  readonly bytes: number;
}> {
  const chat = store.aiChats.chat(input.chat.id);
  const authorize = outputAuthority(store, chat.id);
  authorize();
  const content = await readAttachmentSource(await approvedSource(input));
  const attachment = await files.keepBytes({
    profileId: chat.profile_id,
    authorize,
    name: input.name ?? basename(input.path),
    mime: attachmentMimeOf(input.path),
    content,
    signal: new AbortController().signal,
  });
  authorize();
  const message = new ConversationLog(store).responderInChat({
    chat,
    replyTo: null,
    kind: 'update',
    text: input.what,
    files: [attachment],
  });
  return {
    messageId: message.id,
    attachmentId: attachment.id,
    name: attachment.name,
    mime: attachment.mime,
    bytes: attachment.bytes,
  };
}

function disposition(name: string): string {
  const safe = name.replace(/[^A-Za-z0-9_. -]/gu, '_');
  return `attachment; filename="${safe}"`;
}

async function readDownload(
  root: string,
  candidate: string | undefined,
  now: Date,
): Promise<{ readonly entry: Download; readonly path: string }> {
  const ticket = TOKEN.safeParse(candidate);
  if (!ticket.success) throw new ApiError('not_found', 'This download link is not valid.');
  const directory = join(root, digest(ticket.data));
  const entry = await entryOf(directory);
  if (entry === null) throw new ApiError('not_found', 'This download is no longer available.');
  if (Date.parse(entry.expiresAt) <= now.getTime()) {
    await rm(directory, { recursive: true, force: true });
    throw new ApiError('link_expired', 'This download link expired. Ask for a new one.');
  }
  return { entry, path: join(directory, 'content') };
}

export function chatFileDeliveryRoutes(
  layout: HubLayout,
  now: () => Date = () => new Date(),
): readonly RawRoute[] {
  return [
    {
      method: 'GET',
      path: DOWNLOAD_PATH,
      handle: async (request, response, params): Promise<void> => {
        const { entry, path } = await readDownload(deliveryRoot(layout), params['ticket'], now());
        await serveBytes(
          {
            size: entry.bytes,
            headers: {
              'content-type': 'application/octet-stream',
              'content-disposition': disposition(entry.name),
              'cache-control': 'no-store',
              'referrer-policy': 'no-referrer',
            },
            stream: (range) => createReadStream(path, range),
          },
          request,
          response,
        );
      },
    },
  ];
}
