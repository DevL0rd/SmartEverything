import { ProjectTransfers } from './transfers';
import { Context } from '@deepseek-ai/cordis';
import { lstat, rm } from 'node:fs/promises';
import {
  AI_PROJECT_REQUEST,
  AI_PROJECT_CHUNK_BYTES,
  AI_PROJECT_BYTES_MAX,
  ApiError,
  type AiProjectRequest,
  type AiProjectResult,
} from '@smarteverything/domain';
import { HarnessLocalFileSystem } from '@smarteverything/harness';
import type { Store } from '../store/store';
import { ProjectPaths, missing } from './paths';
import { ProjectQueue } from './queue';
import { ProjectReceipts } from './receipts';
import { projectStat, projectList, projectRead, projectSearch } from './reads';
import { projectMutation, type ProjectMutation } from './mutations';
import type { ProjectAuthority } from './authority';
export class ProjectFilesService {
  private readonly paths: ProjectPaths;
  private readonly queue = new ProjectQueue();
  private readonly receipts: ProjectReceipts;
  private readonly transfers: ProjectTransfers;
  private readonly changes = new Set<(chat: string, path: string) => void>();
  private readonly deleting = new Set<(chat: string) => void>();
  constructor(
    private readonly store: Store,
    dataDirectory: string,
  ) {
    this.paths = new ProjectPaths(store, dataDirectory);
    this.receipts = new ProjectReceipts(store, this.paths);
    this.transfers = new ProjectTransfers(this.paths);
  }
  root(chat: string): string {
    return this.paths.root(chat);
  }
  execute(authority: ProjectAuthority, input: AiProjectRequest): Promise<AiProjectResult> {
    const request = AI_PROJECT_REQUEST.parse(input);
    if (
      request.path.split('/').includes('.operations') ||
      ('destination' in request && request.destination.split('/').includes('.operations'))
    )
      throw new ApiError('forbidden', 'Operation receipts are managed by the project service.');
    this.validate(authority, mutation(request));
    return this.queue.run(authority.chatId, async () => {
      const write = mutation(request);
      this.validate(authority, write);
      const root = await this.paths.ensure(authority.chatId, authority.profileId, () => {
        this.validate(authority, write);
      });
      const fs = new HarnessLocalFileSystem(new Context(), {
        cwd: root,
        diffBasisMaxBytes: AI_PROJECT_CHUNK_BYTES,
      });
      fs.internals.inspectTemp = async ({ tempPath }): Promise<void> => {
        this.validate(authority, true);
        await this.paths.resolve(authority.chatId, request.path, true);
        const info = await lstat(tempPath);
        if (info.size > AI_PROJECT_BYTES_MAX)
          throw new ApiError('invalid_request', 'The project edit exceeds its 25 MiB file bound.');
        this.validate(authority, true);
      };
      const result = await this.perform(authority, fs, request);
      this.validate(authority, write);
      return result;
    });
  }
  private perform(
    authority: ProjectAuthority,
    fs: HarnessLocalFileSystem,
    request: AiProjectRequest,
  ): Promise<AiProjectResult> {
    if (isMutation(request)) return this.mutate(authority, fs, request);
    const chat = authority.chatId;
    switch (request.operation) {
      case 'stat':
        return projectStat(this.paths, fs, chat, request.path).then((file) => ({
          operation: 'stat',
          path: request.path,
          file,
        }));
      case 'list':
        return projectList(this.paths, fs, chat, { path: request.path, limit: request.limit }).then(
          (list) => ({ operation: 'list', path: request.path, ...list }),
        );
      case 'read':
        return projectRead(this.paths, authority, request);
      case 'search':
        return projectSearch(this.paths, fs, authority, request);
    }
  }

  private async mutate(
    authority: ProjectAuthority,
    fs: HarnessLocalFileSystem,
    request: ProjectMutation,
  ): Promise<AiProjectResult> {
    const chat = authority.chatId;
    const previous = await this.receipts.previous(chat, request);
    if (previous !== undefined) return previous;
    this.receipts.begin(chat, request);
    const guarded: ProjectAuthority = {
      ...authority,
      validate: (write): void => {
        this.validate(authority, write);
      },
    };
    const result = isTransfer(request)
      ? await this.transfers.execute(fs, guarded, request)
      : await projectMutation(this.paths, fs, guarded, request);
    await this.receipts.complete(chat, request, result);
    this.store.aiProjects.changed(chat);
    if (!isTransfer(request) || request.operation === 'transfer_finish')
      for (const change of this.changes) change(chat, request.path);
    if (request.operation === 'move')
      for (const change of this.changes) change(chat, request.destination);
    return result;
  }
  readBytes(
    authority: ProjectAuthority,
    path: string,
    offset: number,
    length: number,
  ): Promise<{ readonly bytes: Buffer; readonly size: number; readonly version: string }> {
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      !Number.isSafeInteger(length) ||
      length < 1 ||
      length > AI_PROJECT_CHUNK_BYTES
    )
      throw new ApiError(
        'invalid_request',
        'Project binary reads require a bounded 256 KiB range.',
      );
    this.validate(authority, false);
    return this.queue.run(authority.chatId, () =>
      this.paths.bytes(authority.chatId, path, offset, {
        length,
        validate: (): void => {
          this.validate(authority, false);
        },
      }),
    );
  }

  private validate(authority: ProjectAuthority, write: boolean): void {
    authority.validate(write);
    if (this.store.aiChats.chat(authority.chatId).profile_id !== authority.profileId)
      throw new ApiError('forbidden', 'The managed project chat owner changed.');
    this.store.aiChats.assertWorkAllowed(authority.chatId);
  }
  async removeRoots(ids: readonly string[]): Promise<void> {
    for (const chat of ids) for (const listener of this.deleting) listener(chat);
    for (const chat of ids) {
      if (this.store.aiChats.chat(chat).deletion_state === null)
        throw new ApiError(
          'conflict',
          'Managed roots can be removed only inside the durable chat deletion barrier.',
        );
      await this.queue.drain(chat);
      const root = await this.paths.removal(chat);
      await rm(root, { recursive: true, force: true });
      try {
        await lstat(root);
      } catch (cause) {
        if (missing(cause)) continue;
        throw cause;
      }
      throw new ApiError(
        'conflict',
        'The managed chat folder remains after removal. Retry deleting the chat.',
      );
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
}
function mutation(request: AiProjectRequest): boolean {
  return isMutation(request);
}
function isMutation(request: AiProjectRequest): request is ProjectMutation {
  return (
    request.operation !== 'stat' &&
    request.operation !== 'read' &&
    request.operation !== 'list' &&
    request.operation !== 'search'
  );
}

function isTransfer(
  request: ProjectMutation,
): request is Extract<
  ProjectMutation,
  { operation: 'transfer_start' | 'transfer_chunk' | 'transfer_finish' | 'transfer_cancel' }
> {
  return (
    request.operation === 'transfer_start' ||
    request.operation === 'transfer_chunk' ||
    request.operation === 'transfer_finish' ||
    request.operation === 'transfer_cancel'
  );
}
