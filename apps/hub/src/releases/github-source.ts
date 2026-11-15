import { Readable } from 'node:stream';
import {
  ApiError,
  APP_UPDATE_PLATFORMS,
  RELEASE_LINUX_TARGETS,
  type ReleaseArtifact,
  type ReleaseUpload,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { HubLayout } from '../data-layout';
import { loadSecretKey } from '../secrets/key';
import { SecretStore } from '../secrets/store';
import { findUpdateSource } from '../self-update/update-source';
import type { ReleaseStaging } from './staging';

const log = new Logger('hub.releases');

export const GITHUB_API = 'https://api.github.com';

const API_TIMEOUT_MS = 30_000;

const DOWNLOAD_IDLE_MS = 60_000;

const PAGE_SIZE = 100;

const SHA256_DIGEST = /^sha256:([a-f0-9]{64})$/u;

const ON_BRANCH = new Set(['ahead', 'identical']);

export const RELEASE_TARGETS = [...RELEASE_LINUX_TARGETS, ...APP_UPDATE_PLATFORMS] as const;

export type ReleaseTarget = (typeof RELEASE_TARGETS)[number];

export const GITHUB_REFUSALS = [
  'unavailable',
  'release_missing',
  'release_ambiguous',
  'commit_mismatch',
  'not_on_branch',
  'asset_missing',
  'asset_ambiguous',
  'asset_unverifiable',
  'download_failed',
  'rejected',
] as const;

export type GithubRefusal = (typeof GITHUB_REFUSALS)[number];

export class GithubReleaseError extends Error {
  override readonly name = 'GithubReleaseError';

  constructor(
    readonly reason: GithubRefusal,
    message: string,
  ) {
    super(message);
  }
}

function refuse(reason: GithubRefusal, message: string): never {
  throw new GithubReleaseError(reason, message);
}

const ASSET = z.object({
  id: z.int().positive(),
  name: z.string().min(1),
  size: z.int().positive(),
  state: z.string(),
  digest: z.string().nullish(),
});

type Asset = z.infer<typeof ASSET>;

const RELEASE = z.object({
  tag_name: z.string().min(1),
  target_commitish: z.string(),
  draft: z.boolean(),
  assets: z.array(ASSET),
});

type Release = z.infer<typeof RELEASE>;

const COMMIT = z.object({ sha: z.string().regex(/^[a-f0-9]{40}$/u) });

const COMPARISON = z.object({ status: z.string() });

export interface GithubRepository {
  readonly repository: string;
  readonly branch: string;
}

export interface GithubSourcePorts extends GithubRepository {
  readonly staging: ReleaseStaging;
  readonly token: string | null;
  readonly fetch: typeof fetch;
  readonly api?: string;
  readonly downloadIdleMs?: number;
}

export interface GithubReleaseRequest {
  readonly artifact: ReleaseArtifact;
  readonly tag?: string | undefined;
  readonly commit?: string | undefined;
  readonly target?: ReleaseTarget | undefined;
}

interface Located {
  readonly release: Release;
  readonly commit: string;
}

interface Chosen {
  readonly asset: Asset;
  readonly target: ReleaseTarget;
  readonly sha256: string;
}

class GithubApi {
  private readonly api: string;

  constructor(private readonly ports: GithubSourcePorts) {
    this.api = ports.api ?? GITHUB_API;
  }

  repoPath(path: string): string {
    const [owner = '', name = ''] = this.ports.repository.split('/');
    return `${this.api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}${path}`;
  }

  headers(accept: string): Record<string, string> {
    return {
      accept,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'smarteverything-hub',
      ...(this.ports.token === null ? {} : { authorization: `Bearer ${this.ports.token}` }),
    };
  }

  async json<T>(path: string, schema: z.ZodType<T>): Promise<T | null> {
    let response: Response;
    try {
      response = await this.ports.fetch(this.repoPath(path), {
        headers: this.headers('application/vnd.github+json'),
        signal: AbortSignal.timeout(API_TIMEOUT_MS),
      });
    } catch (cause) {
      return refuse('unavailable', `GitHub could not be reached: ${messageOf(cause)}`);
    }
    if (response.status === 404) return null;
    if (!response.ok)
      refuse(
        'unavailable',
        `GitHub answered ${String(response.status)} for ${this.ports.repository}.`,
      );
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) refuse('unavailable', 'GitHub answered with an unexpected shape.');
    return parsed.data;
  }

  async download(asset: Asset): Promise<Readable> {
    const idleMs = this.ports.downloadIdleMs ?? DOWNLOAD_IDLE_MS;
    const controller = new AbortController();
    const stalled = (): GithubReleaseError =>
      new GithubReleaseError(
        'download_failed',
        `${asset.name} stopped arriving: GitHub sent no bytes for ${String(idleMs / 1000)} seconds.`,
      );
    let response: Response;
    try {
      response = await withinIdle(
        this.ports.fetch(this.repoPath(`/releases/assets/${String(asset.id)}`), {
          headers: this.headers('application/octet-stream'),
          redirect: 'follow',
          signal: controller.signal,
        }),
        idleMs,
        controller,
        stalled,
      );
    } catch (cause) {
      if (cause instanceof GithubReleaseError) throw cause;
      return refuse(
        'download_failed',
        `${asset.name} could not be downloaded: ${messageOf(cause)}`,
      );
    }
    if (!response.ok || response.body === null) {
      controller.abort();
      refuse(
        'download_failed',
        `GitHub answered ${String(response.status)} for the asset ${asset.name}.`,
      );
    }
    return Readable.from(buffers(response.body, idleMs, controller, stalled));
  }
}

async function withinIdle<T>(
  pending: Promise<T>,
  idleMs: number,
  controller: AbortController,
  stalled: () => GithubReleaseError,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const stall = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const reason = stalled();
      controller.abort(reason);
      reject(reason);
    }, idleMs);
  });
  try {
    return await Promise.race([pending, stall]);
  } finally {
    clearTimeout(timer);
  }
}

async function* buffers(
  body: ReadableStream<Uint8Array>,
  idleMs: number,
  controller: AbortController,
  stalled: () => GithubReleaseError,
): AsyncGenerator<Buffer> {
  const reader = body.getReader();
  try {
    for (;;) {
      const next = await withinIdle(reader.read(), idleMs, controller, stalled);
      if (next.done) return;
      const chunk = next.value;
      yield Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    }
  } finally {
    await reader.cancel().catch((cause: unknown) => {
      log.debug('github_release.download_cancel_failed', () => ({ error: messageOf(cause) }));
    });
    controller.abort();
  }
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

async function releaseByTag(api: GithubApi, tag: string): Promise<Release> {
  const release = await api.json(`/releases/tags/${encodeURIComponent(tag)}`, RELEASE);
  if (release === null || release.draft)
    refuse('release_missing', `There is no published GitHub release with the tag ${tag}.`);
  return release;
}

async function releaseByCommit(api: GithubApi, commit: string): Promise<Release> {
  const found: Release[] = [];
  for (let page = 1; ; page += 1) {
    const releases =
      (await api.json(
        `/releases?per_page=${String(PAGE_SIZE)}&page=${String(page)}`,
        z.array(RELEASE),
      )) ?? [];
    found.push(...releases.filter((entry) => !entry.draft && entry.target_commitish === commit));
    if (releases.length < PAGE_SIZE) break;
  }
  const [release, ...others] = found;
  if (release === undefined)
    refuse('release_missing', `There is no published GitHub release for the commit ${commit}.`);
  if (others.length > 0)
    refuse(
      'release_ambiguous',
      `Several GitHub releases are for the commit ${commit}: ${found.map((entry) => entry.tag_name).join(', ')}. Name the tag instead.`,
    );
  return release;
}

async function located(api: GithubApi, request: GithubReleaseRequest): Promise<Located> {
  const release =
    request.tag === undefined
      ? await releaseByCommit(api, request.commit ?? '')
      : await releaseByTag(api, request.tag);
  const tagged = await api.json(`/commits/${encodeURIComponent(release.tag_name)}`, COMMIT);
  if (tagged === null)
    refuse('release_missing', `The tag ${release.tag_name} does not point at a commit.`);
  if (request.commit !== undefined && tagged.sha !== request.commit)
    refuse(
      'commit_mismatch',
      `The release ${release.tag_name} is for the commit ${tagged.sha}, not ${request.commit}.`,
    );
  return { release, commit: tagged.sha };
}

async function requireOnBranch(
  api: GithubApi,
  repository: GithubRepository,
  commit: string,
): Promise<void> {
  const comparison = await api.json(
    `/compare/${commit}...${encodeURIComponent(repository.branch)}`,
    COMPARISON,
  );
  if (comparison === null || !ON_BRANCH.has(comparison.status))
    refuse(
      'not_on_branch',
      `The commit ${commit} is not on ${repository.branch} of ${repository.repository}.`,
    );
}

function targetOf(artifact: ReleaseArtifact, name: string): ReleaseTarget | null {
  const prefix = `smarteverything-${artifact}-`;
  if (!name.startsWith(prefix) || !name.endsWith('.tar')) return null;
  const rest = name.slice(prefix.length);
  return RELEASE_TARGETS.find((target) => rest.startsWith(`${target}-`)) ?? null;
}

function chosen(release: Release, request: GithubReleaseRequest): Chosen {
  const candidates = release.assets.flatMap((asset) => {
    const target = targetOf(request.artifact, asset.name);
    return target === null || (request.target !== undefined && target !== request.target)
      ? []
      : [{ asset, target }];
  });
  const wanted =
    request.target === undefined ? request.artifact : `${request.artifact} ${request.target}`;
  const [first, ...others] = candidates;
  if (first === undefined)
    refuse('asset_missing', `The release ${release.tag_name} has no ${wanted} bundle.`);
  if (others.length > 0)
    refuse(
      'asset_ambiguous',
      `The release ${release.tag_name} has several ${wanted} bundles: ${candidates.map((entry) => entry.asset.name).join(', ')}.`,
    );
  const sha256 = SHA256_DIGEST.exec(first.asset.digest ?? '')?.[1];
  if (first.asset.state !== 'uploaded' || sha256 === undefined)
    refuse(
      'asset_unverifiable',
      `GitHub gives no sha256 digest for the finished upload of ${first.asset.name}.`,
    );
  return { ...first, sha256 };
}

async function staged(
  ports: GithubSourcePorts,
  api: GithubApi,
  request: GithubReleaseRequest,
  choice: Chosen,
): Promise<ReleaseUpload> {
  const { asset } = choice;
  const upload = await ports.staging.begin({
    artifact: request.artifact,
    size: asset.size,
    sha256: choice.sha256,
  });
  try {
    await ports.staging.chunk(upload.uploadId, 0, await api.download(asset), asset.size);
    return await ports.staging.finish(upload.uploadId, 'github');
  } catch (cause) {
    await ports.staging.discard(upload.uploadId);
    if (cause instanceof ApiError) refuse('rejected', cause.message);
    throw cause;
  }
}

function checked(upload: ReleaseUpload, location: Located, choice: Chosen): ReleaseUpload {
  const release = upload.release;
  if (release?.commit !== location.commit)
    refuse(
      'commit_mismatch',
      `The signed bundle is for the commit ${release?.commit ?? 'unknown'}, but the tag ${location.release.tag_name} points at ${location.commit}.`,
    );
  if (release.target !== choice.target)
    refuse(
      'rejected',
      `The signed bundle targets ${release.target}, but its asset is named for ${choice.target}.`,
    );
  return upload;
}

export async function stageGithubRelease(
  ports: GithubSourcePorts,
  request: GithubReleaseRequest,
): Promise<ReleaseUpload> {
  const api = new GithubApi(ports);
  const fields = {
    repository: ports.repository,
    artifact: request.artifact,
    tag: request.tag ?? null,
    commit: request.commit ?? null,
  };
  try {
    const location = await located(api, request);
    await requireOnBranch(api, ports, location.commit);
    const choice = chosen(location.release, request);
    const upload = await staged(ports, api, request, choice);
    try {
      checked(upload, location, choice);
    } catch (cause) {
      await ports.staging.discard(upload.uploadId);
      throw cause;
    }
    log.info('github_release.staged', {
      ...fields,
      uploadId: upload.uploadId,
      asset: choice.asset.name,
      size: choice.asset.size,
      resolvedCommit: location.commit,
    });
    return upload;
  } catch (cause) {
    if (cause instanceof GithubReleaseError)
      log.warn('github_release.refused', { ...fields, reason: cause.reason });
    throw cause;
  }
}

export function githubRepositoryOf(layout: HubLayout): GithubRepository {
  const source = findUpdateSource(layout);
  if (source === undefined)
    refuse('unavailable', 'This hub has no update source configured, so it knows no repository.');
  return { repository: source.repository, branch: source.branch };
}

export async function githubReleaseToken(
  keys: HubLayout['system']['keys'],
): Promise<string | null> {
  const store = await SecretStore.open(keys.secrets, await loadSecretKey(keys.secretKey, log));
  return store.githubReleaseToken();
}
