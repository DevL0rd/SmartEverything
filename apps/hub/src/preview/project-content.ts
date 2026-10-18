import {
  ApiError,
  AI_PREVIEW_HTML_MAX,
  AI_PROJECT_CHUNK_BYTES,
  type AiProjectPreviewSource,
} from '@smarteverything/domain';
import type { ProjectFilesService } from '../projects/service';
import type { ProjectAuthority } from '../projects/authority';
import { isMissing } from '../fs-util';
export interface ProjectAsset {
  readonly bytes: Buffer;
  readonly size: number;
  readonly version: string;
}
export function projectEntryUrl(entry: string): string {
  return `/${entry
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;
}
export async function readProjectAsset(
  projects: ProjectFilesService,
  authority: ProjectAuthority,
  path: string,
  range: { readonly offset: number; readonly length: number },
): Promise<ProjectAsset> {
  try {
    return await projects.readBytes(authority, path, range.offset, range.length);
  } catch (cause) {
    if (isMissing(cause))
      throw new ApiError('not_found', 'The published project file does not exist.');
    throw cause;
  }
}
export function projectAssetPath(source: AiProjectPreviewSource, input: string): string {
  if (!input.startsWith('/') || input.startsWith('//') || /[\\\0\r\n]/u.test(input))
    throw new ApiError('invalid_request', 'Project assets require a plain origin-form path.');
  const raw = input.split(/[?#]/u)[0];
  if (raw === undefined) throw new ApiError('invalid_request', 'Project asset path is missing.');
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch (cause) {
    throw new ApiError(
      'invalid_request',
      `Project asset encoding is invalid (${cause instanceof Error ? cause.name : 'unknown'}).`,
    );
  }
  if (unsafeAssetPath(decoded))
    throw new ApiError('forbidden', 'Project assets cannot leave their published root.');
  const path = decoded === '/' ? source.entry : decoded.slice(1);
  return `${source.root}/${path.endsWith('/') ? `${path}index.html` : path}`;
}
function unsafeAssetPath(decoded: string): boolean {
  return (
    /[\\%\0]/u.test(decoded) ||
    decoded
      .slice(1)
      .split('/')
      .some((part) => part === '.' || part === '..')
  );
}
export async function projectHtml(
  projects: ProjectFilesService,
  authority: ProjectAuthority,
  source: AiProjectPreviewSource,
): Promise<string> {
  const path = `${source.root}/${source.entry}`;
  const first = await readProjectAsset(projects, authority, path, {
    offset: 0,
    length: AI_PROJECT_CHUNK_BYTES,
  });
  if (first.size > AI_PREVIEW_HTML_MAX)
    throw new ApiError('conflict', 'This entry exceeds the standalone native HTML limit.');
  const chunks = [first.bytes];
  let offset = first.bytes.length;
  while (offset < first.size) {
    const chunk = await readProjectAsset(projects, authority, path, {
      offset,
      length: AI_PROJECT_CHUNK_BYTES,
    });
    if (chunk.version !== first.version || chunk.bytes.length === 0)
      throw new ApiError('conflict', 'The project entry changed during its read.');
    chunks.push(chunk.bytes);
    offset += chunk.bytes.length;
  }
  return Buffer.concat(chunks).toString('utf8');
}
