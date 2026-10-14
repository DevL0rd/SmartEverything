import { randomUUID } from 'node:crypto';
import { mkdir, open, rm } from 'node:fs/promises';
import {
  ApiError,
  AI_PROJECT_BYTES_MAX,
  AI_PROJECT_CHUNK_BYTES,
  type AiProjectRequest,
} from '@smarteverything/domain';
import {
  HarnessFsError,
  type HarnessFsVersion,
  type HarnessLocalFileSystem,
} from '@smarteverything/harness';
import type { ProjectAuthority } from './authority';
import type { ProjectPaths } from './paths';
import { projectStat } from './reads';
type Change = Extract<AiProjectRequest, { operation: 'write' | 'edit' }>;
export interface ProjectTextOutcome {
  readonly before: string | null;
  readonly after: string;
  readonly version: string;
  readonly before_truncated: boolean;
}
export async function projectTextFile(
  paths: ProjectPaths,
  fs: HarnessLocalFileSystem,
  authority: ProjectAuthority,
  change: Change,
): Promise<ProjectTextOutcome> {
  await paths.parent(authority.chatId, change.path);
  const stage = `transfers/.operations/${randomUUID()}.text`;
  const directory = await paths.parent(authority.chatId, stage);
  await mkdir(directory, { mode: 0o700 });
  try {
    const before = await stageOriginal(paths, fs, authority, { change, stage });
    const target = await fs.resolve(`${directory}/content`);
    const observed = await fs.stat(target);
    authority.validate(true);
    const outcome =
      change.operation === 'edit'
        ? await fs.editText(
            target,
            {
              oldString: change.old_string,
              newString: change.new_string,
              replaceAll: change.replace_all,
            },
            { version: stagedVersion(observed) },
          )
        : await fs.writeText(
            target,
            change.content,
            observed === undefined
              ? { kind: 'createIfAbsent' }
              : { kind: 'replaceIfVersion', version: observed.version },
          );
    const version = paths.publish(authority.chatId, change.path, {
      staged: `${stage}/content`,
      version: change.version,
      validate: (): void => {
        authority.validate(true);
      },
    });
    return {
      before: outcome.before ?? before.text,
      after: outcome.after,
      version,
      before_truncated: outcome.before === null && before.truncated,
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
async function stageOriginal(
  paths: ProjectPaths,
  fs: HarnessLocalFileSystem,
  authority: ProjectAuthority,
  input: { readonly change: Change; readonly stage: string },
): Promise<{ readonly text: string | null; readonly truncated: boolean }> {
  const { change, stage } = input;
  const file = await projectStat(paths, fs, authority.chatId, change.path);
  if (change.version === null) {
    if (file !== null)
      throw new HarnessFsError(
        'The managed file already exists; read it before replacing it.',
        'FS_NOT_OBSERVED',
      );
    return { text: null, truncated: false };
  }
  if (file?.version !== change.version)
    throw new HarnessFsError('The managed file changed since it was read.', 'FS_STALE_VERSION');
  if (file.type !== 'file' || (change.operation === 'edit' && file.bytes > AI_PROJECT_BYTES_MAX))
    throw new ApiError(
      'invalid_request',
      'The text mutation requires a regular file of at most 25 MiB.',
    );
  const read = await paths.bytes(authority.chatId, change.path, 0, {
    length:
      (change.operation === 'edit' ? file.bytes : Math.min(file.bytes, AI_PROJECT_CHUNK_BYTES)) + 1,
    validate: (): void => {
      authority.validate(true);
    },
  });
  if (read.version !== change.version)
    throw new HarnessFsError(
      'The managed file changed during its text staging.',
      'FS_STALE_VERSION',
    );
  const destination = await paths.resolve(authority.chatId, `${stage}/content`, true);
  const handle = await open(destination, 'wx', 0o600);
  try {
    await handle.writeFile(read.bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  return boundedPreimage(read.bytes, read.size);
}
function stagedVersion(
  info: Awaited<ReturnType<HarnessLocalFileSystem['stat']>>,
): ReturnType<typeof HarnessFsVersion> {
  if (info === undefined)
    throw new HarnessFsError('The staged edit preimage disappeared.', 'FS_STALE_VERSION');
  return info.version;
}
function boundedPreimage(
  bytes: Buffer,
  size: number,
): {
  readonly text: string | null;
  readonly truncated: boolean;
} {
  const prefix = bytes.subarray(0, AI_PROJECT_CHUNK_BYTES);
  if (prefix.includes(0)) return { text: null, truncated: true };
  try {
    const text = new TextDecoder('utf-8', { fatal: true })
      .decode(prefix, { stream: size > prefix.length })
      .replaceAll('\r\n', '\n');
    return { text, truncated: size > prefix.length };
  } catch (cause) {
    if (!(cause instanceof TypeError)) throw cause;
    return { text: null, truncated: true };
  }
}
