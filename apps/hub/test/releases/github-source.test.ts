import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ReleaseKeyRole } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  GithubReleaseError,
  stageGithubRelease,
  type GithubReleaseRequest,
  type GithubSourcePorts,
} from '../../src/releases/github-source';
import { isMissing } from '../../src/fs-util';
import { ReleaseStaging } from '../../src/releases/staging';
import { trustReleaseKey } from '../../src/releases/trust';
import recorded from './fixtures/github-release.json';
import { COMMIT, releaseSigner, scratch, sha256, writeBundle } from './release-fixture';

const API = 'https://api.github.test';

const REPO = `${API}/repos/owner/smarteverything`;

const ASSET_ID = recorded.release.assets[0]?.id ?? 0;

const NOW = new Date('2026-11-14T08:00:00.000Z');

function urlOf(input: Parameters<typeof fetch>[0]): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
}

interface Served {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}

let root: string;
let close: () => Promise<void>;
let stagingRoot: string;
let keysFile: string;
let served: Served[];

beforeEach(async () => {
  ({ root, close } = await scratch());
  stagingRoot = join(root, 'staged');
  keysFile = join(root, 'keys', 'release-keys.json');
  served = [];
});

afterEach(async () => {
  await close();
});

async function signedTar(role: ReleaseKeyRole): Promise<Buffer> {
  const signer = releaseSigner();
  await trustReleaseKey(keysFile, { publicKey: signer.publicKey, role, label: `${role} key` }, NOW);
  const bundle = join(root, 'bundle');
  await writeBundle(bundle, signer);
  const tar = join(root, 'bundle.tar');
  execFileSync('tar', ['--format=pax', '-cf', tar, '-C', bundle, '.']);
  return readFile(tar);
}

type Release = typeof recorded.release;

function releaseFor(tar: Buffer, change: Partial<Release> = {}): Release {
  const [ui, ...rest] = recorded.release.assets;
  if (ui === undefined) throw new Error('The fixture has no ui asset.');
  return {
    ...recorded.release,
    assets: [{ ...ui, size: tar.length, digest: `sha256:${sha256(tar)}` }, ...rest],
    ...change,
  };
}

interface Routes {
  readonly release?: unknown;
  readonly releases?: unknown;
  readonly commit?: unknown;
  readonly compare?: unknown;
  readonly asset?: Buffer;
  readonly assets?: Readonly<Record<number, Buffer>>;
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function routed(routes: Routes): Record<string, Response | undefined> {
  return {
    [`${REPO}/releases/tags/v1.2.3`]:
      routes.release === undefined ? undefined : json(routes.release),
    [`${REPO}/releases?per_page=100&page=1`]:
      routes.releases === undefined ? undefined : json(routes.releases),
    [`${REPO}/commits/v1.2.3`]: json(routes.commit ?? recorded.commit),
    [`${REPO}/compare/${COMMIT}...main`]: json(routes.compare ?? recorded.compare),
    [`${REPO}/releases/assets/${String(ASSET_ID)}`]:
      routes.asset === undefined ? undefined : new Response(new Uint8Array(routes.asset)),
    ...Object.fromEntries(
      Object.entries(routes.assets ?? {}).map(([id, bytes]) => [
        `${REPO}/releases/assets/${id}`,
        new Response(new Uint8Array(bytes)),
      ]),
    ),
  };
}

function portsFor(routes: Routes, token: string | null = null): GithubSourcePorts {
  const table = routed(routes);
  const fake: typeof fetch = (input, init) => {
    const url = urlOf(input);
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    served.push({ url, headers });
    return Promise.resolve(table[url] ?? new Response('{}', { status: 404 }));
  };
  return {
    repository: 'owner/smarteverything',
    branch: 'main',
    staging: new ReleaseStaging({
      root: stagingRoot,
      keysFile,
      now: () => NOW,
      freeBytes: () => Promise.resolve(1024 ** 4),
    }),
    token,
    fetch: fake,
    api: API,
  };
}

const BY_TAG: GithubReleaseRequest = { artifact: 'ui', tag: 'v1.2.3' };

async function refusal(ports: GithubSourcePorts, request = BY_TAG): Promise<GithubReleaseError> {
  try {
    await stageGithubRelease(ports, request);
  } catch (cause) {
    if (cause instanceof GithubReleaseError) return cause;
    throw cause;
  }
  throw new Error('Expected the GitHub release to be refused.');
}

async function stagedNames(): Promise<string[]> {
  try {
    return await readdir(stagingRoot);
  } catch (cause) {
    if (isMissing(cause)) return [];
    throw cause;
  }
}

describe('staging a GitHub release', () => {
  it('downloads the asset of a tag and stages it with the github key', async () => {
    const tar = await signedTar('github');
    const upload = await stageGithubRelease(
      portsFor({ release: releaseFor(tar), asset: tar }),
      BY_TAG,
    );
    expect(upload).toMatchObject({
      artifact: 'ui',
      state: 'staged',
      size: tar.length,
      sha256: sha256(tar),
      release: { commit: COMMIT, target: 'android', version: '1.2.3' },
    });
    expect(await stagedNames()).toEqual([upload.uploadId]);
    expect(served.map((entry) => entry.url)).toEqual([
      `${REPO}/releases/tags/v1.2.3`,
      `${REPO}/commits/v1.2.3`,
      `${REPO}/compare/${COMMIT}...main`,
      `${REPO}/releases/assets/${String(ASSET_ID)}`,
    ]);
    expect(served.at(-1)?.headers['accept']).toBe('application/octet-stream');
    expect(served.every((entry) => entry.headers['authorization'] === undefined)).toBe(true);
  });

  it('finds the release of a commit and sends the read-only token when one is stored', async () => {
    const tar = await signedTar('github');
    const upload = await stageGithubRelease(
      portsFor({ releases: [releaseFor(tar)], asset: tar }, 'read-only-token'),
      { artifact: 'ui', commit: COMMIT },
    );
    expect(upload.state).toBe('staged');
    expect(
      served.every((entry) => entry.headers['authorization'] === 'Bearer read-only-token'),
    ).toBe(true);
  });

  it('refuses a bundle signed by a key trusted only as a machine key', async () => {
    const tar = await signedTar('machine');
    const cause = await refusal(portsFor({ release: releaseFor(tar), asset: tar }));
    expect(cause.reason).toBe('rejected');
    expect(cause.message).toContain('wrong_role');
    expect(await stagedNames()).toEqual([]);
  });

  it('refuses a release without a bundle for the artifact', async () => {
    const tar = await signedTar('github');
    const release = releaseFor(tar);
    const cause = await refusal(
      portsFor({ release: { ...release, assets: release.assets.slice(1) }, asset: tar }),
    );
    expect(cause.reason).toBe('asset_missing');
    expect(served.some((entry) => entry.url.includes('/releases/assets/'))).toBe(false);
    expect(await stagedNames()).toEqual([]);
  });

  it('refuses a release whose commit is not on the update branch', async () => {
    const tar = await signedTar('github');
    const cause = await refusal(
      portsFor({
        release: releaseFor(tar),
        compare: { ...recorded.compare, status: 'diverged', behind_by: 3 },
        asset: tar,
      }),
    );
    expect(cause.reason).toBe('not_on_branch');
    expect(served.some((entry) => entry.url.includes('/releases/assets/'))).toBe(false);
    expect(await stagedNames()).toEqual([]);
  });

  it('refuses a tag that points at another commit than the one asked for', async () => {
    const tar = await signedTar('github');
    const cause = await refusal(
      portsFor({ releases: [releaseFor(tar)], commit: { sha: 'b'.repeat(40) }, asset: tar }),
      { artifact: 'ui', commit: COMMIT },
    );
    expect(cause.reason).toBe('commit_mismatch');
  });

  it('refuses an asset without a GitHub digest', async () => {
    const tar = await signedTar('github');
    const release = releaseFor(tar);
    const [ui, ...rest] = release.assets;
    if (ui === undefined) throw new Error('The fixture has no ui asset.');
    const cause = await refusal(
      portsFor({ release: { ...release, assets: [{ ...ui, digest: null }, ...rest] } }),
    );
    expect(cause.reason).toBe('asset_unverifiable');
  });

  it('refuses a download that does not match the digest and leaves nothing staged', async () => {
    const tar = await signedTar('github');
    const tampered = Buffer.from(tar);
    tampered[tampered.length - 1] = 1;
    const cause = await refusal(portsFor({ release: releaseFor(tar), asset: tampered }));
    expect(cause.reason).toBe('rejected');
    expect(await stagedNames()).toEqual([]);
  });

  it('abandons a download whose body stops arriving and leaves nothing staged', async () => {
    const tar = await signedTar('github');
    const ports = portsFor({ release: releaseFor(tar) });
    let cancelled = false;
    const stalling = new ReadableStream<Uint8Array>({
      start(controller): void {
        controller.enqueue(new Uint8Array(tar.subarray(0, 512)));
      },
      cancel(): void {
        cancelled = true;
      },
    });
    const cause = await refusal({
      ...ports,
      downloadIdleMs: 50,
      fetch: (input, init) =>
        urlOf(input).endsWith(`/releases/assets/${String(ASSET_ID)}`)
          ? Promise.resolve(new Response(stalling))
          : ports.fetch(input, init),
    });
    expect(cause.reason).toBe('download_failed');
    expect(cause.message).toContain('stopped arriving');
    expect(cancelled).toBe(true);
    expect(await stagedNames()).toEqual([]);
  });

  it('abandons a download whose response never starts', async () => {
    const tar = await signedTar('github');
    const ports = portsFor({ release: releaseFor(tar) });
    let aborted = false;
    const cause = await refusal({
      ...ports,
      downloadIdleMs: 50,
      fetch: (input, init) => {
        if (!urlOf(input).endsWith(`/releases/assets/${String(ASSET_ID)}`))
          return ports.fetch(input, init);
        init?.signal?.addEventListener('abort', () => {
          aborted = true;
        });
        return new Promise<Response>(() => undefined);
      },
    });
    expect(cause.reason).toBe('download_failed');
    expect(aborted).toBe(true);
    expect(await stagedNames()).toEqual([]);
  });

  it('refuses a tag that has no release', async () => {
    const cause = await refusal(portsFor({}));
    expect(cause.reason).toBe('release_missing');
  });

  describe('a release with several bundles of one artifact', () => {
    const DESKTOP_UI_ID = 310000010;

    const X64_ID = 310000011;

    const ARM64_ID = 310000012;

    function extra(tar: Buffer, id: number, name: string): Release['assets'][number] {
      const [ui] = recorded.release.assets;
      if (ui === undefined) throw new Error('The fixture has no ui asset.');
      return { ...ui, id, name, size: tar.length, digest: `sha256:${sha256(tar)}` };
    }

    function withBundles(tar: Buffer): Release {
      const release = releaseFor(tar);
      const [ui] = release.assets;
      if (ui === undefined) throw new Error('The fixture has no ui asset.');
      return {
        ...release,
        assets: [
          ui,
          extra(tar, DESKTOP_UI_ID, 'smarteverything-ui-desktop-1.2.3.tar'),
          extra(tar, X64_ID, 'smarteverything-desktop-linux-x64-1.2.3.tar'),
          extra(tar, ARM64_ID, 'smarteverything-desktop-linux-arm64-1.2.3.tar'),
        ],
      };
    }

    function downloads(): string[] {
      return served
        .map((entry) => entry.url)
        .filter((url) => url.includes('/releases/assets/'))
        .map((url) => url.slice(url.lastIndexOf('/') + 1));
    }

    it('refuses a ui release of two platforms when no platform is named', async () => {
      const tar = await signedTar('github');
      const cause = await refusal(portsFor({ release: withBundles(tar), asset: tar }));
      expect(cause.reason).toBe('asset_ambiguous');
      expect(cause.message).toContain('smarteverything-ui-desktop-1.2.3.tar');
      expect(downloads()).toEqual([]);
      expect(await stagedNames()).toEqual([]);
    });

    it('stages the android ui bundle when the platform is android', async () => {
      const tar = await signedTar('github');
      const upload = await stageGithubRelease(portsFor({ release: withBundles(tar), asset: tar }), {
        ...BY_TAG,
        target: 'android',
      });
      expect(upload.state).toBe('staged');
      expect(downloads()).toEqual([String(ASSET_ID)]);
    });

    it('downloads the desktop ui bundle when the platform is desktop', async () => {
      const tar = await signedTar('github');
      const cause = await refusal(
        portsFor({ release: withBundles(tar), assets: { [DESKTOP_UI_ID]: tar } }),
        { ...BY_TAG, target: 'desktop' },
      );
      expect(cause.reason).toBe('rejected');
      expect(downloads()).toEqual([String(DESKTOP_UI_ID)]);
    });

    it('refuses a desktop release of two single-architecture bundles', async () => {
      const tar = await signedTar('github');
      const cause = await refusal(
        portsFor({ release: withBundles(tar), assets: { [X64_ID]: tar, [ARM64_ID]: tar } }),
        { artifact: 'desktop', tag: 'v1.2.3' },
      );
      expect(cause.reason).toBe('asset_ambiguous');
      expect(downloads()).toEqual([]);
    });

    it('takes the one desktop bundle of a release without naming an architecture', async () => {
      const tar = await signedTar('github');
      const release = withBundles(tar);
      const cause = await refusal(
        portsFor({
          release: { ...release, assets: release.assets.filter((asset) => asset.id !== ARM64_ID) },
          assets: { [X64_ID]: tar },
        }),
        { artifact: 'desktop', tag: 'v1.2.3' },
      );
      expect(cause.reason).toBe('rejected');
      expect(downloads()).toEqual([String(X64_ID)]);
    });
  });
});
