import { readdir } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import {
  ApiError,
  type AiProjectFile,
  type AiReference,
  type AiReferenceSearch,
  type AiReferenceSummary,
} from '@smarteverything/domain';
import type { ProjectFilesService } from '../projects/service';
import type { ReferenceContext, ReferenceMatches } from './contracts';
import { rankMatches } from './rank';
import { isMissing } from '../fs-util';

const AREAS = ['workspace', 'temporary'] as const;
type ManagedReference = Extract<AiReference, { kind: 'managed_path' }>;

export async function searchManaged(
  projects: ProjectFilesService,
  context: ReferenceContext,
  request: AiReferenceSearch,
): Promise<ReferenceMatches> {
  const container = request.container;
  if (container?.kind === 'device_path') return { items: [], incomplete: false };
  if (container !== undefined && container.chat_id !== context.chat.id)
    throw new ApiError('forbidden', 'Directory search must remain in this chat’s project folder.');
  const directory = container?.path ?? request.directory;
  const root = projects.ensure(context.chat.id);
  const found =
    directory === undefined ? await scanAreas(root) : await scanDirectory(root, directory);
  const ranked = rankMatches(found, request.query, (path) => ({
    title: basename(path),
    extra: path,
  }));
  const files = await Promise.all(
    ranked.slice(0, request.limit).map((path) => projects.stat(context.chat.id, path)),
  );
  const items = files.flatMap((file) => (file === null ? [] : [summary(context.chat.id, file)]));
  return { items, incomplete: ranked.length > request.limit };
}

export async function resolveManaged(
  projects: ProjectFilesService,
  context: ReferenceContext,
  reference: ManagedReference,
): Promise<void> {
  if (reference.chat_id !== context.chat.id)
    throw new ApiError('forbidden', 'Project references cannot leave their initiating chat.');
  const file = await projects.stat(context.chat.id, reference.path);
  if (file?.type !== reference.entry_kind)
    throw new ApiError('conflict', 'The referenced project path is no longer available.');
}

function summary(chat: string, file: AiProjectFile): AiReferenceSummary {
  return {
    reference: {
      kind: 'managed_path',
      chat_id: chat,
      path: file.path,
      version: file.version,
      entry_kind: file.type,
    },
    label: basename(file.path).slice(0, 300),
    subtitle: file.path,
  };
}

async function scanAreas(root: string): Promise<string[]> {
  const paths: string[] = [];
  for (const area of AREAS) {
    const entries = await readdir(join(root, area), { recursive: true, withFileTypes: true });
    for (const entry of entries)
      if (listed(entry)) paths.push(relative(root, join(entry.parentPath, entry.name)));
  }
  return paths;
}

async function scanDirectory(root: string, directory: string): Promise<string[]> {
  const entries = await readdir(join(root, directory), { withFileTypes: true }).catch(
    (cause: unknown) => {
      if (isMissing(cause))
        throw new ApiError('not_found', 'The referenced project directory is absent.');
      throw cause;
    },
  );
  return entries.filter(listed).map((entry) => `${directory}/${entry.name}`);
}

function listed(entry: {
  readonly isDirectory: () => boolean;
  readonly isFile: () => boolean;
}): boolean {
  return entry.isDirectory() || entry.isFile();
}
