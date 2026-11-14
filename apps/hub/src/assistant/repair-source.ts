import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { env } from 'node:process';
import { promisify } from 'node:util';
import {
  AI_REPAIR_SOURCE_PATH,
  AI_REPAIR_SOURCE_REVISION,
  ApiError,
  type AiRepairPatchRequest,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { HubLayout } from '../data-layout';
import { findUpdateSource } from '../self-update/update-source';

const git = promisify(execFile);
const SOURCE_BYTES = 12 * 1024;
const GIT_DEADLINE_MS = 3000;
const SOURCE_HASH = z.string().regex(/^[a-f0-9]{64}$/u);
const NULL = String.fromCharCode(0);
const TEXT = z
  .string()
  .min(1)
  .refine(
    (text) =>
      Buffer.byteLength(text, 'utf8') <= SOURCE_BYTES &&
      !text.includes(NULL) &&
      !text.includes('\r') &&
      !text.includes('\ufffd'),
  );

export const REPAIR_SOURCE = z.strictObject({
  path: AI_REPAIR_SOURCE_PATH,
  digest: SOURCE_HASH,
  text: TEXT,
});
type RepairSource = z.infer<typeof REPAIR_SOURCE>;

export const REPAIR_PATCH = z.strictObject({
  revision: AI_REPAIR_SOURCE_REVISION,
  sources: z.array(REPAIR_SOURCE).min(1).max(3),
});
export type RepairPatch = z.infer<typeof REPAIR_PATCH>;

export function repairSourceDigest(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function checkoutRoot(layout: HubLayout): string {
  const source = findUpdateSource(layout);
  if (source === undefined)
    throw new ApiError(
      'conflict',
      'Configure a source checkout on the hub before proposing a patch.',
    );
  return source.checkout;
}

async function readGit(root: string, args: readonly string[]): Promise<string> {
  try {
    const processEnvironment = Object.fromEntries(
      Object.entries(env).filter(([key]) => !key.startsWith('GIT_')),
    );
    const { stdout } = await git(
      'git',
      ['--no-replace-objects', '-c', 'protocol.allow=never', '-C', root, ...args],
      {
        encoding: 'utf8',
        env: {
          ...processEnvironment,
          GIT_NO_LAZY_FETCH: '1',
          GIT_OPTIONAL_LOCKS: '0',
          GIT_TERMINAL_PROMPT: '0',
          LC_ALL: 'C',
        },
        maxBuffer: SOURCE_BYTES,
        timeout: GIT_DEADLINE_MS,
      },
    );
    return stdout;
  } catch (cause) {
    if (!(cause instanceof Error)) throw cause;
    throw new ApiError(
      'invalid_request',
      'Could not read the approved revision or source file.',
      cause.name,
    );
  }
}

async function readSource(root: string, revision: string, path: string): Promise<RepairSource> {
  const line = await readGit(root, ['ls-tree', '-z', revision, '--', path]);
  const parts = line.split(NULL);
  const [row, tail] = parts;
  const entry = row === undefined ? null : /^100(?:644|755) blob ([0-9a-f]{40})\t(.+)$/u.exec(row);
  const blob = entry?.[1];
  if (parts.length !== 2 || tail !== '' || blob === undefined || entry?.[2] !== path)
    throw new ApiError('invalid_request', `Choose a tracked regular source file. Check ${path}.`);
  const text = await readGit(root, ['cat-file', 'blob', blob]);
  if (!TEXT.safeParse(text).success)
    throw new ApiError('invalid_request', `Use UTF-8 source under 12 KiB. Check ${path}.`);
  return { path, digest: repairSourceDigest(text), text };
}

export async function sealRepairSource(
  layout: HubLayout,
  request: AiRepairPatchRequest,
): Promise<RepairPatch> {
  const root = checkoutRoot(layout);
  const { revision, paths } = request;
  if ((await readGit(root, ['cat-file', '-t', revision])).trim() !== 'commit')
    throw new ApiError('invalid_request', 'Choose the full ID of a Git commit.');
  const sources = await Promise.all(paths.map((path) => readSource(root, revision, path)));
  return { revision, sources };
}

export function validatedRepairPatch(input: RepairPatch): RepairPatch {
  const patch = REPAIR_PATCH.parse(input);
  const paths = new Set(patch.sources.map(({ path }) => path));
  if (
    paths.size !== patch.sources.length ||
    patch.sources.some(({ digest, text }) => repairSourceDigest(text) !== digest)
  )
    throw new ApiError('conflict', 'The approved source snapshot changed.');
  return patch;
}
