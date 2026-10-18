import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { z } from 'zod';
import { ApiError } from '@smarteverything/domain';
import type { HARNESS_ATTACHMENT_TRANSFER } from '@smarteverything/domain';
import type { HarnessAttachment } from '@smarteverything/harness/process';
import type { HarnessService } from './service';
import type { AssistantFiles } from '../assistant/files';
import type { StoredAttachment } from '../store/repositories/assistant-chat';

export class HarnessAttachments {
  constructor(
    private readonly service: HarnessService,
    private readonly files: AssistantFiles,
  ) {}
  async *load(sessionId: string, ids: readonly string[]): AsyncIterable<HarnessAttachment> {
    for (const id of ids) yield await this.read(this.find(sessionId, id));
  }
  find(sessionId: string, id: string): StoredAttachment {
    const grant = this.service.storage.grant(sessionId);
    const metadata = this.service.store.dshSessions.stat(sessionId, grant.profile_id);
    if (metadata === undefined)
      throw new ApiError('not_found', 'Native attachment conversation is absent.');
    const file = this.service.store.assistantChat
      .attachmentsOfChat(metadata.chat_id)
      .find((entry) => entry.id === id && entry.profile_id === grant.profile_id);
    if (file === undefined)
      throw new ApiError(
        'forbidden',
        'Attachment is not attached to this initiating conversation.',
      );
    return file;
  }
  async read(file: StoredAttachment): Promise<HarnessAttachment> {
    const data = await readFile(this.files.pathOf(file));
    if (
      data.byteLength !== file.bytes ||
      createHash('sha256').update(data).digest('hex') !== file.sha256
    )
      throw new ApiError('conflict', 'Stored attachment length differs from its admitted upload.');
    return {
      id: file.id,
      name: file.name,
      mime: file.mime,
      data,
      transcript: this.files.noteOf(file),
    };
  }
  describe(file: StoredAttachment): z.infer<typeof HARNESS_ATTACHMENT_TRANSFER> {
    return {
      name: file.name,
      mime: file.mime,
      bytes: file.bytes,
      sha256: file.sha256,
      transcript: this.files.noteOf(file),
    };
  }
}
