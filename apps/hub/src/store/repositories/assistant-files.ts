import { ASSISTANT_ATTACHMENT } from '@smarteverything/domain';
import { z } from 'zod';
import { storedRow } from '../codec';

export const STORED_FILE = storedRow(
  ASSISTANT_ATTACHMENT.extend({
    message_id: z.uuid().nullable(),
    profile_id: z.uuid(),
    storage_path: z.string().min(1),
    sha256: z.string().length(64),
    transcript: z.string().nullable(),
    created_at: z.iso.datetime({ offset: true }),
  }),
  {},
);

export type StoredAttachment = z.output<typeof STORED_FILE>;

export const FILE_COLUMNS =
  'id, message_id, profile_id, name, mime, bytes, width, height, storage_path, sha256, transcript, created_at';

export type NewAttachment = Omit<StoredAttachment, 'created_at' | 'message_id' | 'transcript'>;
