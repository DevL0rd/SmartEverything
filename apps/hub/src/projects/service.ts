import { Context } from '@deepseek-ai/cordis';
import { readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  AI_PROJECT_PATH,
  AI_PROJECT_REQUEST,
  AI_PROJECT_CHUNK_BYTES,
  ApiError,
  type AiProjectFile,
  type AiProjectRequest,
  type AiProjectResult,
} from '@smarteverything/domain';
import { HarnessLocalFileSystem } from '@smarteverything/harness';
import { chatFolder, ensureChatFolder } from './paths';
import { ProjectQueue } from './queue';
import {
  projectList,
  projectRead,
  projectSearch,
  projectStat,
  readProjectBytes,
  type ProjectBytes,
} from './reads';
import { projectMutation, type ProjectMutation } from './mutations';
import type { ProjectAuthority } from './authority';
import { isMissing } from '../fs-util';

const BYTES_MAX = 4 * AI_PROJECT_CHUNK_BYTES;

export class ProjectFilesService {
  private readonly queue = new ProjectQueue();
  private readonly fs: HarnessLocalFileSystem;
  private readonly changes = new Set<(chat: string, path: string) => void>();
  private readonly deleting = new Set<(chat: string) => void>();
  constructor(private readonly dataDirectory: string) {
    this.fs = new HarnessLocalFileSystem(new Context(), {
      cwd: dataDirectory,
      diffBasisMaxBytes: AI_PROJECT_CHUNK_BYTES,
    });
  }
  root(chat: string): string {
    return chatFolder(this.dataDirectory, chat);
  }
  ensure(chat: string): string {
    return ensureChatFolder(this.root(chat));
  }
  stat(chat: string, path: string): Promise<AiProjectFile | null> {
    const relative = AI_PROJECT_PATH.parse(path);
    return projectStat(
      { root: this.root(chat), fs: this.fs },
      relative,
      join(this.root(chat), relative),
    );
  }
  execute(authority: ProjectAuthority, input: AiProjectRequest): Promise<AiProjectResult> {
    const request = AI_PROJECT_REQUEST.parse(input);
    const write = isMutation(request);
    return this.queue.run(authority.chatId, async () => {
      authority.validate(write);
      const folder = { root: this.ensure(authority.chatId), fs: this.fs };
      const result = write
        ? await projectMutation(folder, request)
        : await this.read(folder, request);
      if (write) this.notify(authority.chatId, request);
      return result;
    });
  }
  readBytes(
    authority: ProjectAuthority,
    path: string,
    offset: number,
    length: number,
  ): Promise<ProjectBytes> {
    if (length < 1 || length > BYTES_MAX)
      throw new ApiError('invalid_request', 'Project reads are bounded to 1 MiB per range.');
    const relative = AI_PROJECT_PATH.parse(path);
    return this.queue.run(authority.chatId, () => {
      authority.validate(false);
      return readProjectBytes({ root: this.root(authority.chatId), fs: this.fs }, relative, {
        offset,
        length,
      });
    });
  }
  readFile(authority: ProjectAuthority, path: string, maxBytes: number): Promise<Buffer> {
    const absolute = join(this.root(authority.chatId), AI_PROJECT_PATH.parse(path));
    return this.queue.run(authority.chatId, async () => {
      authority.validate(false);
      const info = await stat(absolute).catch((cause: unknown) => {
        if (isMissing(cause)) throw new ApiError('not_found', 'The chat folder file is absent.');
        throw cause;
      });
      if (!info.isFile() || info.size > maxBytes)
        throw new ApiError('invalid_request', 'The chat folder path is not a file within bounds.');
      return readFile(absolute);
    });
  }
  async removeRoots(ids: readonly string[]): Promise<void> {
    for (const chat of ids) for (const listener of this.deleting) listener(chat);
    for (const chat of ids) {
      await this.queue.drain(chat);
      await rm(this.root(chat), { recursive: true, force: true });
    }
  }
  onChange(listener: (chat: string, path: string) => void): () => void {
    this.changes.add(listener);
    return (): void => {
      this.changes.delete(listener);
    };
  }
  onDeleting(listener: (chat: string) => void): () => void {
    this.deleting.add(listener);
    return (): void => {
      this.deleting.delete(listener);
    };
  }
  private read(
    folder: { readonly root: string; readonly fs: HarnessLocalFileSystem },
    request: Exclude<AiProjectRequest, ProjectMutation>,
  ): Promise<AiProjectResult> {
    switch (request.operation) {
      case 'stat':
        return projectStat(folder, request.path, join(folder.root, request.path)).then((file) => ({
          operation: 'stat',
          path: request.path,
          file,
        }));
      case 'list':
        return projectList(folder, { path: request.path, limit: request.limit }).then((list) => ({
          operation: 'list',
          path: request.path,
          ...list,
        }));
      case 'read':
        return projectRead(folder, request);
      case 'search':
        return projectSearch(folder, request);
    }
  }
  private notify(chat: string, request: ProjectMutation): void {
    for (const change of this.changes) change(chat, request.path);
    if (request.operation === 'move')
      for (const change of this.changes) change(chat, request.destination);
  }
}

function isMutation(request: AiProjectRequest): request is ProjectMutation {
  return (
    request.operation !== 'stat' &&
    request.operation !== 'read' &&
    request.operation !== 'list' &&
    request.operation !== 'search'
  );
}
