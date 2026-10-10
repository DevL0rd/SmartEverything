import { randomUUID } from 'node:crypto';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { basename, join, sep } from 'node:path';
import type { AssistantOutFile, InboundMessage, PluginRow } from '@smarteverything/domain';

const LARGEST_BYTES = 10 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30_000;

type Attachment = InboundMessage['attachments'][number];

export class InboundFileError extends Error {
  override readonly name = 'InboundFileError';
}

export interface InboundFileOptions {
  readonly plugin: PluginRow;
  readonly folder: string;
  readonly fetch: typeof fetch;
}

async function downloaded(url: string, fetcher: typeof fetch): Promise<Buffer> {
  const response = await fetcher(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok) {
    throw new InboundFileError(
      `The attachment at ${new URL(url).host} answered ${String(response.status)}`,
    );
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > LARGEST_BYTES) {
    throw new InboundFileError('An attachment is larger than 10 MB');
  }
  return bytes;
}

async function allowedPath(path: string, options: InboundFileOptions): Promise<string> {
  const real = await realpath(path).catch(() => {
    throw new InboundFileError(`The attachment ${basename(path)} does not exist`);
  });
  const own = await realpath(options.folder);
  if (!options.plugin.trusted && !real.startsWith(own + sep)) {
    throw new InboundFileError('An untrusted plugin may only attach files from its own folder');
  }
  return real;
}

async function saved(bytes: Buffer, name: string, folder: string): Promise<string> {
  const inbox = join(folder, 'inbox');
  await mkdir(inbox, { recursive: true, mode: 0o700 });
  const path = join(inbox, `${randomUUID()}-${basename(name)}`);
  await writeFile(path, bytes, { mode: 0o600 });
  return path;
}

async function fileOf(
  attachment: Attachment,
  options: InboundFileOptions,
): Promise<AssistantOutFile> {
  const { source } = attachment;
  switch (source.kind) {
    case 'path':
      return { path: await allowedPath(source.path, options) };
    case 'base64':
      return {
        path: await saved(Buffer.from(source.data, 'base64'), attachment.name, options.folder),
      };
    case 'url':
      return {
        path: await saved(
          await downloaded(source.url, options.fetch),
          attachment.name,
          options.folder,
        ),
      };
  }
}

export function inboundFiles(
  attachments: readonly Attachment[],
  options: InboundFileOptions,
): Promise<AssistantOutFile[]> {
  return Promise.all(attachments.map((attachment) => fileOf(attachment, options)));
}
