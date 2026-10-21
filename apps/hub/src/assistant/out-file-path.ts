import { realpath, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, sep } from 'node:path';
import { ApiError, ASSISTANT_ATTACHMENT_BYTES_MAX } from '@smarteverything/domain';
import { isMissing } from '../fs-util';

export type OutFileHome =
  { readonly kind: 'chat'; readonly path: string } | { readonly kind: 'temp' };

export interface ResolvedOutFile {
  readonly real: string;
  readonly home: OutFileHome;
}

const MEGABYTES = ASSISTANT_ATTACHMENT_BYTES_MAX / (1024 * 1024);

export function within(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}${sep}`);
}

async function realOrNull(path: string): Promise<string | null> {
  try {
    return await realpath(path);
  } catch (cause) {
    if (isMissing(cause)) return null;
    throw cause;
  }
}

export function refusal(chatFolder: string): ApiError {
  return new ApiError(
    'forbidden',
    `A chat can attach only files inside its own folder (${join(chatFolder, 'workspace')} or ${join(chatFolder, 'temporary')}) or the system temp folder (${tmpdir()}). Copy the file into one of those, or use the upload operations (startAssistantUpload, sendAssistantUploadChunk, finishAssistantUpload) and post the returned uploadId.`,
  );
}

export function remoteRefusal(): ApiError {
  return new ApiError(
    'forbidden',
    'This caller is not on the machine that runs the chat, so it cannot attach files by path. Upload the bytes with startAssistantUpload, sendAssistantUploadChunk and finishAssistantUpload, then post files:[{uploadId}].',
  );
}

async function checkedFile(real: string): Promise<void> {
  const info = await stat(real);
  if (!info.isFile() || info.size === 0 || info.size > ASSISTANT_ATTACHMENT_BYTES_MAX)
    throw new ApiError(
      'invalid_request',
      `That path is not a non-empty file of at most ${String(MEGABYTES)} MB.`,
    );
}

export async function resolveOutFile(
  requested: string,
  chatFolder: string,
  projectsRoot: string,
): Promise<ResolvedOutFile> {
  const candidate = isAbsolute(requested) ? requested : join(chatFolder, requested);
  const real = await realOrNull(candidate);
  if (real === null)
    throw new ApiError(
      'not_found',
      `No file exists at ${candidate}. Write it into ${join(chatFolder, 'workspace')} or ${join(chatFolder, 'temporary')} first.`,
    );
  const areas = await Promise.all(
    ['workspace', 'temporary'].map((area) => realOrNull(join(chatFolder, area))),
  );
  const area = areas.find((root) => root !== null && within(real, root));
  if (area !== undefined && area !== null) {
    await checkedFile(real);
    return { real, home: { kind: 'chat', path: relative(join(area, '..'), real) } };
  }
  const [temp, projects] = await Promise.all([realOrNull(tmpdir()), realOrNull(projectsRoot)]);
  if (temp === null || !within(real, temp) || (projects !== null && within(real, projects)))
    throw refusal(chatFolder);
  await checkedFile(real);
  return { real, home: { kind: 'temp' } };
}
