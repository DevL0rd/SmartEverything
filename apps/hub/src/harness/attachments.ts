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
    for (const id of ids) yield await this.read(await this.find(sessionId, id));
  }
  find(sessionId: string, id: string): Promise<StoredAttachment> {
    return this.service.store.host.read('harnessAttachment', { session_id: sessionId, id });
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
      transcript: await this.files.noteOf(file),
    };
  }
  async describe(file: StoredAttachment): Promise<z.infer<typeof HARNESS_ATTACHMENT_TRANSFER>> {
    return {
      name: file.name,
      mime: file.mime,
      bytes: file.bytes,
      sha256: file.sha256,
      transcript: await this.files.noteOf(file),
    };
  }
}
