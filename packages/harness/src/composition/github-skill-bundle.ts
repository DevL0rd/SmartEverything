import { z } from 'zod';
import {
  HARNESS_SKILL_ASSET_BUNDLE,
  MAX_SKILL_ASSET_BYTES,
  MAX_SKILL_ASSET_FILES,
} from './skill-asset-format';
import type { HarnessSkillAssetBundle } from './skill-asset-format';
import { readSkillSourceHttp } from './skill-source-http';
import { HarnessRuntimeError } from '../host/errors';

const MAX_GITHUB_TREE_BYTES = 2 * 1024 * 1024;
const MAX_GITHUB_FILE_BYTES = 1536 * 1024;
const GITHUB_TREE = z.object({
  truncated: z.boolean(),
  tree: z
    .array(
      z.object({
        path: z.string().min(1).max(4096),
        mode: z.string(),
        type: z.string(),
        size: z.int().nonnegative().optional(),
      }),
    )
    .max(20_000),
});

export interface GithubSkillSourceIdentity {
  readonly owner: string;
  readonly repository: string;
  readonly commit: string;
  readonly path: string;
}

export function githubSkillIdentity(url: string): GithubSkillSourceIdentity {
  const [, owner, repository, commit, ...path] = new URL(url).pathname.split('/');
  if (owner === undefined || repository === undefined || commit === undefined || path.length === 0)
    throw new HarnessRuntimeError(
      'operation_failed',
      'Pinned GitHub skill identity is incomplete.',
    );
  return { owner, repository, commit, path: path.join('/') };
}

export async function githubSkillBundle(
  identity: GithubSkillSourceIdentity,
  signal: AbortSignal,
): Promise<Buffer> {
  const prefix = identity.path.slice(0, -'SKILL.md'.length);
  if (prefix === '')
    throw new HarnessRuntimeError(
      'composition_incompatible',
      'A shared skill must have its own confined repository folder.',
    );
  return encodeSkillBundle(await githubFolderFiles(identity, prefix, signal));
}

export async function githubFolderFiles(
  identity: GithubSkillSourceIdentity,
  prefix: string,
  signal: AbortSignal,
): Promise<HarnessSkillAssetBundle['files']> {
  const treeUrl = `https://api.github.com/repos/${identity.owner}/${identity.repository}/git/trees/${identity.commit}?recursive=1`;
  const tree = GITHUB_TREE.parse(
    JSON.parse(
      new TextDecoder('utf8', { fatal: true }).decode(
        await readSkillSourceHttp(treeUrl, MAX_GITHUB_TREE_BYTES, signal),
      ),
    ),
  );
  if (tree.truncated)
    throw new HarnessRuntimeError(
      'operation_failed',
      'Repository inventory is truncated; publish a bounded JSON skill bundle instead.',
    );
  const members = tree.tree.filter(
    (entry) => entry.path.startsWith(prefix) && entry.type !== 'tree',
  );
  requireSkillMembers(members);
  const files: HarnessSkillAssetBundle['files'] = [];
  let size = 0;
  HARNESS_SKILL_ASSET_BUNDLE.parse({
    files: members.map((member) => ({ path: member.path.slice(prefix.length), base64: '' })),
  });
  for (const member of members.sort(orderSkillMembers)) {
    const url = `https://raw.githubusercontent.com/${identity.owner}/${identity.repository}/${identity.commit}/${member.path.split('/').map(encodeURIComponent).join('/')}`;
    const bytes = await readSkillSourceHttp(url, MAX_GITHUB_FILE_BYTES, signal);
    size += bytes.byteLength;
    if (size > MAX_SKILL_ASSET_BYTES)
      throw new HarnessRuntimeError(
        'operation_failed',
        'Skill folder exceeds the bounded total byte limit.',
      );
    files.push({ path: member.path.slice(prefix.length), base64: bytes.toString('base64') });
  }
  return files;
}

export function encodeSkillBundle(files: HarnessSkillAssetBundle['files']): Buffer {
  const bytes = Buffer.from(JSON.stringify(HARNESS_SKILL_ASSET_BUNDLE.parse({ files })));
  if (bytes.byteLength > MAX_SKILL_ASSET_BYTES)
    throw new HarnessRuntimeError(
      'operation_failed',
      'Normalized skill bundle exceeds the bounded total byte limit.',
    );
  return bytes;
}

function orderSkillMembers(
  left: { readonly path: string },
  right: { readonly path: string },
): number {
  if (left.path === right.path) return 0;
  return left.path < right.path ? -1 : 1;
}

function requireSkillMembers(members: z.infer<typeof GITHUB_TREE>['tree']): void {
  if (members.length === 0 || members.length > MAX_SKILL_ASSET_FILES)
    throw new HarnessRuntimeError(
      'operation_failed',
      'Skill folder must contain a bounded nonempty set of files.',
    );
  if (members.some((entry) => entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)))
    throw new HarnessRuntimeError(
      'composition_incompatible',
      'Skill folders cannot contain symbolic links or submodules.',
    );
}
