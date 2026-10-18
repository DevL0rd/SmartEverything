import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, sep } from 'node:path';
import type { AssistantOutFile, InboundMessage, PluginRow } from '@smarteverything/domain';

const LARGEST_BYTES = 10 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30_000;

type Attachment = InboundMessage['attachments'][number];

class InboundFileError extends Error {
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

async function bytesOf(attachment: Attachment, options: InboundFileOptions): Promise<Buffer> {
  const { source } = attachment;
  switch (source.kind) {
    case 'path':
      return readFile(await allowedPath(source.path, options));
    case 'base64':
      return Buffer.from(source.data, 'base64');
    case 'url':
      return downloaded(source.url, options.fetch);
  }
}

async function saved(
  attachment: Attachment,
  options: InboundFileOptions,
  folder: string,
): Promise<AssistantOutFile> {
  const own = join(folder, randomUUID());
  await mkdir(own, { mode: 0o700 });
  const path = join(own, basename(attachment.name));
  await writeFile(path, await bytesOf(attachment, options), { mode: 0o600 });
  return { path };
}

export interface InboundFiles {
  readonly files: AssistantOutFile[];
  readonly discard: () => Promise<void>;
}

export async function inboundFiles(
  attachments: readonly Attachment[],
  options: InboundFileOptions,
): Promise<InboundFiles> {
  if (attachments.length === 0) {
    return { files: [], discard: () => Promise.resolve() };
  }
  const folder = await mkdtemp(join(tmpdir(), 'smarteverything-inbound-'));
  const discard = (): Promise<void> => rm(folder, { recursive: true, force: true });
  try {
    const files = await Promise.all(
      attachments.map((attachment) => saved(attachment, options, folder)),
    );
    return { files, discard };
  } catch (cause) {
    await discard();
    throw cause;
  }
}
