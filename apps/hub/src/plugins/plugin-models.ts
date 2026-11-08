import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { PluginModelContribution } from '@smarteverything/domain';
import { Logger, describeFailure } from '@smarteverything/logging';
import {
  entryFromContribution,
  MODEL_SPEC_BYTE_LIMIT,
  type ModelContent,
  type ModelEntry,
  type ModelRejection,
} from '../models/contributions';
import type { ModelBatchResult, ModelCatalogService } from '../models/catalog-service';
import { isPrivateIPv4 } from '../network/lan';
import { PROBE_TIMEOUT_MS, readBodyLimited, readFileLimited } from './manifest-source';

const log = new Logger('hub.plugin-models');

export const STATUS_DETAIL_LIMIT = 400;

const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

export type PluginAssetOrigin =
  | { readonly kind: 'folder'; readonly folder: string }
  | {
      readonly kind: 'url';
      readonly manifestUrl: string;
      readonly fetch: typeof fetch;
    };

function problem(text: string): { readonly problem: string } {
  return { problem: text };
}

function isRelativeAssetPath(path: string): boolean {
  if (path === '' || isAbsolute(path) || path.includes('\\') || path.includes('\0')) return false;
  return path.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

function isInside(root: string, target: string): boolean {
  const path = relative(root, target);
  return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

async function realOrNull(path: string): Promise<string | null> {
  try {
    return await realpath(path);
  } catch (cause) {
    log.debug('asset.path_unresolvable', () => ({ error: describeFailure(cause).message }));
    return null;
  }
}

async function readFolderAsset(folder: string, path: string, limit: number): Promise<ModelContent> {
  if (!isRelativeAssetPath(path)) {
    return problem('is not a relative path inside the plugin folder');
  }
  const root = await realOrNull(folder);
  if (root === null) return problem('cannot be read because the plugin folder is missing');
  const target = await realOrNull(resolve(root, path));
  if (target === null) return problem('was not found in the plugin folder');
  if (!isInside(root, target)) return problem('is outside the plugin folder');
  const info = await stat(target);
  if (!info.isFile()) return problem('is not a file');
  const body = await readFileLimited(target, limit);
  return body.ok ? body.bytes : problem(body.problem);
}

function isLanHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    isPrivateIPv4(host) ||
    host.startsWith('127.') ||
    host.startsWith('169.254.') ||
    host === 'localhost' ||
    host.endsWith('.local') ||
    host === '[::1]' ||
    host.startsWith('[fe80:')
  );
}

function originProblem(url: URL, base: URL): string | null {
  if (url.origin !== base.origin) return `redirects outside the plugin origin to ${url.host}`;
  const plainOnSameOrigin =
    url.protocol === 'http:' && base.protocol === 'http:' && isLanHost(base.hostname);
  if (url.protocol !== 'https:' && !plainOnSameOrigin) return 'is not served over https';
  return null;
}

function redirectTarget(response: Response, from: URL): URL | null {
  const location = response.headers.get('location');
  if (!REDIRECT_STATUSES.has(response.status) || location === null) return null;
  return new URL(location, from);
}

interface Fetching {
  readonly base: URL;
  readonly fetcher: typeof fetch;
  readonly limit: number;
  readonly signal: AbortSignal;
}

async function fetchWithinOrigin(start: URL, how: Fetching): Promise<ModelContent> {
  const { base, fetcher, limit, signal } = how;
  const seen = new Set<string>();
  let current = start;
  for (;;) {
    if (seen.has(current.href)) return problem('redirects in a loop');
    seen.add(current.href);
    const wrong = originProblem(current, base);
    if (wrong !== null) return problem(wrong);
    const response = await fetcher(current, {
      method: 'GET',
      redirect: 'manual',
      credentials: 'omit',
      headers: { accept: '*/*' },
      signal,
    });
    const next = redirectTarget(response, current);
    if (next !== null) {
      await response.body?.cancel();
      current = next;
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      return problem(`could not be fetched (HTTP ${String(response.status)})`);
    }
    const body = await readBodyLimited(response, limit);
    return body.ok ? body.bytes : problem(body.problem);
  }
}

async function readUrlAsset(
  origin: Extract<PluginAssetOrigin, { kind: 'url' }>,
  path: string,
  limit: number,
): Promise<ModelContent> {
  if (!isRelativeAssetPath(path)) return problem('is not a relative path inside the plugin');
  const base = new URL(origin.manifestUrl);
  const signal = AbortSignal.timeout(PROBE_TIMEOUT_MS);
  try {
    return await fetchWithinOrigin(new URL(path, base), {
      base,
      fetcher: origin.fetch,
      limit,
      signal,
    });
  } catch (cause) {
    if (signal.aborted) return problem(`timed out after ${String(PROBE_TIMEOUT_MS / 1000)} s`);
    return problem(`could not be fetched (${describeFailure(cause).message})`);
  }
}

async function readAsset(
  origin: PluginAssetOrigin,
  path: string,
  limit: number,
): Promise<ModelContent> {
  try {
    return origin.kind === 'folder'
      ? await readFolderAsset(origin.folder, path, limit)
      : await readUrlAsset(origin, path, limit);
  } catch (cause) {
    return problem(`could not be read (${describeFailure(cause).message})`);
  }
}

export async function loadPluginModelEntries(
  origin: PluginAssetOrigin,
  contributions: readonly PluginModelContribution[],
): Promise<ModelEntry[]> {
  const entries: ModelEntry[] = [];
  for (const contribution of contributions) {
    const spec = await readAsset(origin, contribution.spec, MODEL_SPEC_BYTE_LIMIT);
    entries.push(entryFromContribution(contribution, { spec }));
  }
  return entries;
}

export function statusDetailOf(rejections: readonly ModelRejection[]): string | null {
  if (rejections.length === 0) return null;
  const head = 'Model files rejected: ';
  const lines = rejections.map((item) => `${item.file} (${item.id}) ${item.problem}`);
  for (let shown = lines.length; shown >= 1; shown -= 1) {
    const rest = lines.length - shown;
    const tail = rest === 0 ? '' : `; and ${String(rest)} more (see the hub log)`;
    const detail = `${head}${lines.slice(0, shown).join('; ')}${tail}`;
    if (detail.length <= STATUS_DETAIL_LIMIT) return detail;
  }
  return `${head}${lines[0] ?? ''}`.slice(0, STATUS_DETAIL_LIMIT - 1) + '…';
}

export async function syncPluginModels(
  service: Pick<ModelCatalogService, 'replace'>,
  pluginId: string,
  origin: PluginAssetOrigin,
  contributions: readonly PluginModelContribution[],
): Promise<ModelBatchResult> {
  const entries = await loadPluginModelEntries(origin, contributions);
  const result = service.replace({ owner: `plugin:${pluginId}`, entries });
  log.info('plugin_models.synced', {
    plugin: pluginId,
    source: origin.kind,
    accepted: result.accepted.length,
    rejected: result.rejections.length,
  });
  return { ...result, statusDetail: statusDetailOf(result.rejections) };
}
