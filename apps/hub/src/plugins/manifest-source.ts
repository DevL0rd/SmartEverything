import { Logger, describeFailure } from '@smarteverything/logging';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import {
  ApiError,
  PLUGIN_MANIFEST,
  PLUGIN_MANIFEST_FILE,
  PLUGIN_MANIFEST_RESOURCE,
  type PluginInstall,
  type PluginManifest,
  type PluginManifestInput,
} from '@smarteverything/domain';
import { z } from 'zod';

const log = new Logger('hub.plugin-manifest');

export const PROBE_TIMEOUT_MS = 15_000;

export const MANIFEST_BYTE_LIMIT = 1024 * 1024;

const DECODER = new TextDecoder('utf-8', { fatal: true });

const RESOURCE_TEXT = z.looseObject({
  contents: z.array(z.looseObject({ text: z.string() })).min(1),
});

export type LimitedBody =
  | { readonly ok: true; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly problem: string };

function overLimit(limit: number, size?: number): string {
  const found = size === undefined ? 'larger' : `${String(size)} bytes`;
  return `is ${found}, over the ${String(limit)} byte limit`;
}

function joined(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return bytes;
}

export async function readBodyLimited(response: Response, limit: number): Promise<LimitedBody> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) {
    await response.body?.cancel();
    return { ok: false, problem: overLimit(limit, declared) };
  }
  if (response.body === null) return { ok: true, bytes: new Uint8Array(0) };
  const reader: ReadableStreamDefaultReader<Uint8Array> = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) return { ok: true, bytes: joined(chunks, total) };
    total += part.value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return { ok: false, problem: overLimit(limit) };
    }
    chunks.push(part.value);
  }
}

export async function readFileLimited(file: string, limit: number): Promise<LimitedBody> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of createReadStream(file, { start: 0, end: limit })) {
    const bytes = chunk instanceof Uint8Array ? chunk : Buffer.from(chunk);
    total += bytes.byteLength;
    chunks.push(bytes);
  }
  return total > limit
    ? { ok: false, problem: overLimit(limit) }
    : { ok: true, bytes: joined(chunks, total) };
}

function manifestJson(bytes: Uint8Array, where: string): unknown {
  try {
    return JSON.parse(DECODER.decode(bytes));
  } catch (cause) {
    const reason = describeFailure(cause).message;
    throw new ApiError(
      'invalid_request',
      `The plugin manifest at ${where} is not valid JSON (${reason}).`,
    );
  }
}

function declaredManifest(text: string, where: string): unknown {
  const bytes = new TextEncoder().encode(text);
  if (bytes.byteLength > MANIFEST_BYTE_LIMIT) {
    throw tooLarge(where, overLimit(MANIFEST_BYTE_LIMIT, bytes.byteLength));
  }
  return manifestJson(bytes, where);
}

function tooLarge(where: string, problem: string): ApiError {
  return new ApiError('invalid_request', `The plugin manifest at ${where} ${problem}.`);
}

export interface FoundManifest {
  readonly manifest: PluginManifest;
  readonly location: string;
}

function parsed(raw: unknown, where: string): PluginManifest {
  const result = PLUGIN_MANIFEST.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path.join('.') ?? '';
    throw new ApiError(
      'invalid_request',
      `The plugin manifest at ${where} is not valid: ${path} ${first?.message ?? ''}`.trim(),
    );
  }
  return result.data;
}

function slugOf(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return /^[a-z]/.test(slug) && slug.length >= 2 ? slug : `mcp-${slug}`.slice(0, 40);
}

async function wellKnown(url: URL, fetcher: typeof fetch): Promise<unknown> {
  const response = await fetcher(new URL('/.well-known/smarteverything-plugin.json', url), {
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  const body = await readBodyLimited(response, MANIFEST_BYTE_LIMIT);
  if (!body.ok) throw tooLarge(url.toString(), body.problem);
  return JSON.parse(DECODER.decode(body.bytes));
}

async function probed(url: URL): Promise<unknown> {
  const client = new Client({ name: 'SmartEverything', version: '1.0.0' }, { capabilities: {} });
  await client.connect(new StreamableHTTPClientTransport(url), { timeout: PROBE_TIMEOUT_MS });
  try {
    const declared = await client
      .readResource({ uri: PLUGIN_MANIFEST_RESOURCE })
      .then((result) => RESOURCE_TEXT.parse(result).contents[0]?.text ?? null)
      .catch((cause: unknown) => {
        log.debug('manifest.resource_unreadable', () => ({
          host: url.host,
          error: describeFailure(cause).message,
        }));
        return null;
      });
    if (declared !== null) {
      return declaredManifest(declared, url.toString());
    }
    const server = client.getServerVersion();
    const name = server?.title ?? server?.name ?? url.host;
    const fallback: PluginManifestInput = {
      id: slugOf(server?.name ?? url.host),
      name: name.slice(0, 60),
      version: server?.version ?? '0.0.0',
      description: `Tools from ${url.host}`,
      publisher: url.host.slice(0, 60),
      mcp: { transport: 'http', url: url.toString() },
    };
    return fallback;
  } finally {
    await client.close();
  }
}

async function fromUrl(text: string, fetcher: typeof fetch): Promise<FoundManifest> {
  const url = new URL(text);
  const declared = await wellKnown(url, fetcher).catch((cause: unknown) => {
    if (cause instanceof ApiError) throw cause;
    log.debug('manifest.well_known_unreadable', () => ({
      host: url.host,
      error: describeFailure(cause).message,
    }));
    return null;
  });
  const raw = declared ?? (await probed(url));
  const manifest = parsed(raw, url.toString());
  const mcp = manifest.mcp ?? { transport: 'http' as const, url: url.toString(), bearer: null };
  if (mcp.transport !== 'http') {
    throw new ApiError('invalid_request', 'A plugin added from a link must be an HTTP MCP server.');
  }
  return { manifest: { ...manifest, mcp }, location: url.toString() };
}

async function fromFolder(path: string): Promise<FoundManifest> {
  if (!isAbsolute(path)) {
    throw new ApiError('invalid_request', 'Choose the plugin folder with its full path.');
  }
  const folder = resolve(path);
  const info = await stat(folder).catch((cause: unknown) => {
    log.debug('manifest.folder_unreadable', () => ({ error: describeFailure(cause).message }));
    return null;
  });
  if (info?.isDirectory() !== true) {
    throw new ApiError('not_found', `There is no folder at ${folder}.`);
  }
  const file = join(folder, PLUGIN_MANIFEST_FILE);
  const body = await readFileLimited(file, MANIFEST_BYTE_LIMIT).catch(() => {
    throw new ApiError('not_found', `The folder has no ${PLUGIN_MANIFEST_FILE}.`);
  });
  if (!body.ok) throw tooLarge(file, body.problem);
  const manifest = parsed(manifestJson(body.bytes, file), file);
  if (manifest.mcp?.transport !== 'stdio') {
    throw new ApiError(
      'invalid_request',
      'A plugin from this computer needs an "mcp" command (stdio).',
    );
  }
  return { manifest, location: folder };
}

export function findManifest(
  install: PluginInstall,
  fetcher: typeof fetch,
): Promise<FoundManifest> {
  return install.source === 'url' ? fromUrl(install.url, fetcher) : fromFolder(install.path);
}
