import { createHash, randomUUID } from 'node:crypto';
import {
  AI_PROJECT_CHUNK_BYTES,
  ASSISTANT_ATTACHMENT_BYTES_MAX,
  ApiError,
} from '@smarteverything/domain';
import { imageSize } from './image-size';
import type { ProjectFilesService } from '../projects/service';
import { StoreNotFoundError } from '../store/context';
import type { Store } from '../store/store';
import type { StoredAttachment } from '../store/repositories/assistant-chat';
import type { ProjectAuthority } from '../projects/authority';
export interface ManagedOutput {
  readonly id: string;
  readonly chatId: string;
  readonly profileId: string;
  readonly name: string;
  readonly mime: string;
  readonly content: Buffer;
  readonly signal: AbortSignal;
  readonly authorize: () => void;
}
export class ManagedOutputs {
  constructor(
    private readonly store: Store,
    private readonly projects: ProjectFilesService,
  ) {}
  private authority(
    input: Pick<ManagedOutput, 'chatId' | 'profileId' | 'signal' | 'authorize'>,
  ): ProjectAuthority {
    return {
      chatId: input.chatId,
      profileId: input.profileId,
      validate: (): void => {
        input.signal.throwIfAborted();
        input.authorize();
        const chat = this.store.aiChats.chat(input.chatId);
        if (chat.profile_id !== input.profileId)
          throw new ApiError('forbidden', 'Output belongs to another profile.');
        this.store.aiChats.assertWorkAllowed(input.chatId);
      },
    };
  }
  async keep(input: ManagedOutput): Promise<StoredAttachment> {
    if (input.content.length === 0 || input.content.length > ASSISTANT_ATTACHMENT_BYTES_MAX)
      throw new ApiError('invalid_request', 'Output bytes exceed the supported attachment bound.');
    const authority = this.authority(input);
    const path = `temporary/files/${input.id}/${input.name}`;
    await this.transfer(authority, path, input.content);
    authority.validate(true);
    const size = input.mime.startsWith('image/') ? imageSize(input.content) : null;
    return this.store.assistantChat.addAttachment({
      id: input.id,
      profile_id: input.profileId,
      name: input.name,
      mime: input.mime,
      bytes: input.content.length,
      width: size?.width ?? null,
      height: size?.height ?? null,
      storage_path: `projects/${input.chatId}/${path}`,
      sha256: createHash('sha256').update(input.content).digest('hex'),
    });
  }
  private async transfer(authority: ProjectAuthority, path: string, bytes: Buffer): Promise<void> {
    const transfer_id = randomUUID();
    await this.projects.execute(authority, {
      operation: 'transfer_start',
      path,
      version: null,
      transfer_id,
      total_bytes: bytes.length,
      encoding: 'base64',
      operation_id: randomUUID(),
    });
    for (let offset = 0; offset < bytes.length; offset += AI_PROJECT_CHUNK_BYTES)
      await this.projects.execute(authority, {
        operation: 'transfer_chunk',
        path,
        transfer_id,
        offset,
        content: bytes.subarray(offset, offset + AI_PROJECT_CHUNK_BYTES).toString('base64'),
        operation_id: randomUUID(),
      });
    await this.projects.execute(authority, {
      operation: 'transfer_finish',
      path,
      transfer_id,
      operation_id: randomUUID(),
    });
  }
  async read(input: {
    readonly profileId: string;
    readonly chatId: string;
    readonly path: string;
    readonly authorize: () => void;
  }): Promise<Buffer> {
    const authority = this.authority({ ...input, signal: new AbortController().signal });
    const stat = await this.projects.execute(authority, { operation: 'stat', path: input.path });
    if (stat.file?.type !== 'file')
      throw new ApiError('not_found', 'Managed output source is absent.');
    if (stat.file.bytes > ASSISTANT_ATTACHMENT_BYTES_MAX)
      throw new ApiError('invalid_request', 'Managed output source exceeds the attachment bound.');
    const chunks: Buffer[] = [];
    for (let offset = 0; offset < stat.file.bytes; offset += AI_PROJECT_CHUNK_BYTES) {
      const result = await this.projects.readBytes(
        authority,
        input.path,
        offset,
        Math.min(AI_PROJECT_CHUNK_BYTES, stat.file.bytes - offset),
      );
      if (result.version !== stat.file.version)
        throw new ApiError('conflict', 'Managed output changed during attachment import.');
      chunks.push(result.bytes);
    }
    return Buffer.concat(chunks);
  }
  private chatForRemoval(id: string): ReturnType<Store['aiChats']['chat']> | undefined {
    try {
      return this.store.aiChats.chat(id);
    } catch (cause) {
      if (cause instanceof StoreNotFoundError) return undefined;
      throw cause;
    }
  }
  async remove(file: StoredAttachment): Promise<void> {
    const parts = file.storage_path.split('/');
    const chatId = parts[1];
    if (chatId === undefined)
      throw new ApiError('invalid_request', 'Managed output chat is absent.');
    const chat = this.chatForRemoval(chatId);
    if (chat?.deletion_state !== null) return;
    const authority = this.authority({
      chatId,
      profileId: file.profile_id,
      signal: new AbortController().signal,
      authorize: (): void => {
        return;
      },
    });
    const path = parts.slice(2).join('/');
    const stat = await this.projects.execute(authority, { operation: 'stat', path });
    if (stat.file === undefined || stat.file === null) return;
    await this.projects.execute(authority, {
      operation: 'remove',
      path,
      version: stat.file.version,
      recursive: false,
      operation_id: randomUUID(),
    });
  }
}
