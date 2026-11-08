import {
  ASSISTANT_ATTACHMENT,
  ASSISTANT_LEVELS,
  ApiError,
  type AssistantAttachment,
} from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';
import type { StoreContext } from '../context';

export const STORED_FILE = storedRow(
  ASSISTANT_ATTACHMENT.extend({
    message_id: z.uuid().nullable(),
    profile_id: z.uuid(),
    storage_path: z.string().min(1),
    sha256: z.string().length(64),
    transcript: z.string().nullable(),
    levels: ASSISTANT_LEVELS.nullable(),
    created_at: z.iso.datetime({ offset: true }),
  }),
  { json: ['levels'] },
);

export type StoredAttachment = z.output<typeof STORED_FILE>;

export const FILE_COLUMNS =
  'id, message_id, profile_id, name, mime, bytes, width, height, storage_path, sha256, transcript, levels, created_at';

export type NewAttachment = Omit<
  StoredAttachment,
  'created_at' | 'message_id' | 'transcript' | 'levels'
>;

export function summaryOf(file: StoredAttachment): AssistantAttachment {
  return {
    id: file.id,
    name: file.name,
    mime: file.mime,
    bytes: file.bytes,
    width: file.width,
    height: file.height,
    transcript: file.transcript,
    levels: file.levels,
  };
}

export class AttachmentCleanup {
  private readonly pending = new Map<string, 'removing' | 'retry'>();

  async discard(
    candidates: readonly StoredAttachment[],
    remove: (file: StoredAttachment) => Promise<void>,
  ): Promise<void> {
    const claimed = candidates.filter((file) => this.pending.get(file.id) !== 'removing');
    claimed.forEach((file) => this.pending.set(file.id, 'removing'));
    await Promise.all(
      claimed.map(async (file) => {
        try {
          await remove(file);
          this.pending.delete(file.id);
        } catch (cause) {
          this.pending.set(file.id, 'retry');
          throw cause;
        }
      }),
    );
  }

  assertAvailable(id: string): void {
    if (this.pending.has(id)) throw expiredUpload();
  }
}

function expiredUpload(): ApiError {
  return new ApiError('conflict', 'The attachment is no longer available. Attach the file again.');
}

const ATTACHMENT_ID = z.strictObject({ id: z.uuid() });

export function attachFiles(
  context: StoreContext,
  cleanup: AttachmentCleanup,
  messageId: string,
  ids: readonly string[],
): void {
  context.write(() => {
    for (const id of ids) {
      cleanup.assertAvailable(id);
      const changed = context.sql.run(
        'attach the file to the assistant message',
        'update assistant_attachments set message_id = $message where id = $id and message_id is null',
        { message: messageId, id },
      );
      if (
        changed === 0 &&
        context.sql.get(ATTACHMENT_ID, 'select id from assistant_attachments where id = $id', {
          id,
        }) === undefined
      )
        throw expiredUpload();
    }
  });
}
