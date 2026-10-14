import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ApiError } from '@smarteverything/domain';
import type { HarnessAttachment } from '@smarteverything/harness/process';
import type { HarnessService } from './service';
import type { AssistantFiles } from '../assistant/files';
import { mediaKindOf } from '../transcripts/media-notes';

export class HarnessAttachments {
  constructor(
    private readonly service: HarnessService,
    private readonly files: AssistantFiles,
  ) {}
  async *load(sessionId: string, ids: readonly string[]): AsyncIterable<HarnessAttachment> {
    const grant = this.service.storage.grant(sessionId);
    const metadata = this.service.store.dshSessions.stat(sessionId, grant.profile_id);
    if (metadata === undefined)
      throw new ApiError('not_found', 'Native attachment conversation is absent.');
    const files = this.service.store.assistantChat.attachmentsOfChat(metadata.chat_id);
    for (const id of ids) {
      const file = files.find((entry) => entry.id === id && entry.profile_id === grant.profile_id);
      if (file === undefined)
        throw new ApiError(
          'forbidden',
          'Attachment is not attached to this initiating conversation.',
        );
      const data = await readFile(this.files.pathOf(file));
      if (
        data.byteLength !== file.bytes ||
        createHash('sha256').update(data).digest('hex') !== file.sha256
      )
        throw new ApiError(
          'conflict',
          'Stored attachment length differs from its admitted upload.',
        );
      yield {
        id: file.id,
        name: file.name,
        mime: file.mime,
        data,
        transcript:
          mediaKindOf(file.mime) === null
            ? file.transcript
            : await this.files.ensureMediaNote(file),
      };
    }
  }
}
