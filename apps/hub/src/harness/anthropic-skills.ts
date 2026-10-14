import { HARNESS_SKILL_ASSET_BUNDLE, inspectHarnessSkillBundle } from '@smarteverything/harness';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ApiError, HARNESS_SKILL_ASSET, type HarnessDiscoveryItem } from '@smarteverything/domain';
import { readDiscoveryJson, readDiscoverySource } from './discovery-http';

const REF = z.object({ object: z.object({ sha: z.string().regex(/^[a-f0-9]{40}$/u) }) });
const SKILL_PATH = z.string().regex(/^\.\/skills\/[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const MANIFEST = z.object({
  plugins: z
    .array(
      z.object({
        description: z.string().min(1).max(2000),
        skills: z.array(SKILL_PATH).min(1).max(32),
      }),
    )
    .min(1)
    .max(32),
});
const CACHE_MS = 60 * 60 * 1000;
const MAX_SNAPSHOTS = 4;
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_LICENSE_BYTES = 64 * 1024;
const METADATA_CONCURRENCY = 4;
const APACHE_LICENSE_DIGESTS: ReadonlySet<string> = new Set([
  'b07ad4a4900d46be94d243cd01e4da044ec810932a06312683e7f25bcf5c75cf',
  '59d8f0ba87ad9a2f1a431123c8d16646e5b89ba53653e818f16d136d77263c99',
]);
export const ANTHROPIC_SKILLS_SOURCE = {
  id: 'anthropic-skills',
  label: 'Anthropic skills',
  url: 'https://github.com/anthropics/skills',
} as const;
export interface AnthropicSkillSnapshot {
  readonly commit: string;
  readonly fetched_at: string;
  readonly items: readonly HarnessDiscoveryItem[];
}

export class AnthropicSkills {
  private current: AnthropicSkillSnapshot | undefined;
  private pending: Promise<AnthropicSkillSnapshot> | undefined;
  private readonly snapshots = new Map<string, AnthropicSkillSnapshot>();

  snapshot(refresh: boolean, commit?: string): Promise<AnthropicSkillSnapshot> {
    if (commit !== undefined) return Promise.resolve(this.retainedSnapshot(commit));
    if (this.pending !== undefined) return this.pending;
    if (
      !refresh &&
      this.current !== undefined &&
      Date.now() - Date.parse(this.current.fetched_at) < CACHE_MS
    )
      return Promise.resolve(this.current);
    this.pending = this.load().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  retainedSnapshot(commit: string): AnthropicSkillSnapshot {
    const retained = this.snapshots.get(commit);
    if (retained === undefined)
      throw new ApiError('conflict', 'Skill catalogue snapshot expired. Restart at page one.');
    return retained;
  }

  cached(): AnthropicSkillSnapshot | undefined {
    return this.current;
  }

  private async load(): Promise<AnthropicSkillSnapshot> {
    const ref = REF.parse(
      await readDiscoveryJson(
        'https://api.github.com/repos/anthropics/skills/git/ref/heads/main',
        MAX_MANIFEST_BYTES,
        ANTHROPIC_SKILLS_SOURCE.label,
      ),
    );
    const commit = ref.object.sha;
    const known = this.snapshots.get(commit);
    const items = known === undefined ? await loadSkillItems(commit) : known.items;
    const snapshot = { commit, fetched_at: new Date().toISOString(), items };
    this.snapshots.delete(commit);
    this.snapshots.set(commit, snapshot);
    while (this.snapshots.size > MAX_SNAPSHOTS) {
      const oldest = this.snapshots.keys().next().value;
      if (oldest !== undefined) this.snapshots.delete(oldest);
    }
    this.current = snapshot;
    return snapshot;
  }
}

async function loadSkillItems(commit: string): Promise<readonly HarnessDiscoveryItem[]> {
  const manifest = MANIFEST.parse(
    await readDiscoveryJson(
      rawSkillUrl(commit, '.claude-plugin/marketplace.json'),
      MAX_MANIFEST_BYTES,
      ANTHROPIC_SKILLS_SOURCE.label,
    ),
  );
  const paths = manifest.plugins.flatMap((plugin) =>
    plugin.skills.map((path) => ({ path: path.slice(2), description: plugin.description })),
  );
  if (paths.length > 32 || new Set(paths.map((entry) => entry.path)).size !== paths.length)
    throw new ApiError(
      'conflict',
      'Anthropic skill manifest must contain at most 32 unique skill folders.',
    );
  const items: HarnessDiscoveryItem[] = [];
  for (let offset = 0; offset < paths.length; offset += METADATA_CONCURRENCY) {
    const batch = paths.slice(offset, offset + METADATA_CONCURRENCY);
    items.push(...(await Promise.all(batch.map((entry) => skillItem(commit, entry)))));
  }
  return items.sort((left, right) => left.name.localeCompare(right.name));
}

async function skillItem(
  commit: string,
  entry: { readonly path: string; readonly description: string },
): Promise<HarnessDiscoveryItem> {
  const license = await anthropicSkillLicense(commit, entry.path);
  const path = `${entry.path}/SKILL.md`;
  const display =
    license === 'Apache-2.0'
      ? await skillPresentation(commit, path)
      : { name: entry.path.slice('skills/'.length), description: entry.description };
  return {
    id: anthropicSkillId(path),
    kind: 'skill',
    ...display,
    publisher: 'Anthropic',
    license,
    source_url: `https://github.com/anthropics/skills/tree/${commit}/${entry.path}`,
    installed_id: null,
    acquisition:
      license === 'Apache-2.0'
        ? { state: 'available', url: rawSkillUrl(commit, path) }
        : {
            state: 'unsupported',
            reason:
              license === null
                ? 'No approved Apache-2.0 license was found for this skill.'
                : 'This skill has restricted or unrecognized terms and is excluded from shared acquisition.',
          },
  };
}

export async function anthropicSkillLicense(commit: string, path: string): Promise<string | null> {
  const bytes = await readDiscoverySource(
    rawSkillUrl(commit, `${path}/LICENSE.txt`),
    MAX_LICENSE_BYTES,
    ANTHROPIC_SKILLS_SOURCE.label,
    true,
  );
  if (bytes === null) return null;
  const text = new TextDecoder('utf8', { fatal: true })
    .decode(bytes)
    .trim()
    .split(/\s+/u)
    .join(' ');
  return APACHE_LICENSE_DIGESTS.has(createHash('sha256').update(text).digest('hex'))
    ? 'Apache-2.0'
    : 'Restricted or unrecognized';
}

export function anthropicSkillId(path: string): string {
  return `github-skill:${createHash('sha256').update(`anthropics/skills/${path}`).digest('hex')}`;
}

export function rawSkillUrl(commit: string, path: string): string {
  return `https://raw.githubusercontent.com/anthropics/skills/${commit}/${path}`;
}

async function skillPresentation(
  commit: string,
  path: string,
): Promise<{ readonly name: string; readonly description: string }> {
  const url = rawSkillUrl(commit, path);
  const bytes = await readDiscoverySource(url, 1536 * 1024, ANTHROPIC_SKILLS_SOURCE.label);
  if (bytes === null) throw new ApiError('conflict', 'Approved skill entrypoint is unavailable.');
  const bundle = Buffer.from(
    JSON.stringify(
      HARNESS_SKILL_ASSET_BUNDLE.parse({
        files: [{ path: 'SKILL.md', base64: bytes.toString('base64') }],
      }),
    ),
  );
  const asset = HARNESS_SKILL_ASSET.parse({
    id: anthropicSkillId(path),
    version: commit,
    entrypoint: 'SKILL.md',
    source: { kind: 'artifact', url },
    integrity: `sha256-${createHash('sha256').update(bundle).digest('base64')}`,
  });
  return inspectHarnessSkillBundle(asset, bundle, AbortSignal.timeout(30_000));
}
