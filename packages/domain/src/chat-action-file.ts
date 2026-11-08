import { z } from 'zod';

export const CHAT_ACTION_FILE_REF = z.strictObject({
  id: z.uuid().describe('The file’s id within the action that offered it'),
  path: z
    .string()
    .min(1)
    .max(1024)
    .describe('Absolute path of the file on the hub while the offer lasts'),
  name: z.string().min(1).max(200).describe('The file name people see when they download it'),
});

export type ChatActionFileRef = z.infer<typeof CHAT_ACTION_FILE_REF>;

export const CHAT_ACTION_FILE = CHAT_ACTION_FILE_REF.extend({
  runId: z.uuid(),
  chatId: z.uuid(),
  profileId: z.uuid().describe('Whose files they are; only this person or the owner claims it'),
  expiresAt: z.iso.datetime({ offset: true }),
});

export type ChatActionFile = z.infer<typeof CHAT_ACTION_FILE>;

export const CHAT_ACTION_FILE_CLAIM = z.strictObject({ runId: z.uuid(), fileId: z.uuid() });

export type ChatActionFileClaim = z.infer<typeof CHAT_ACTION_FILE_CLAIM>;

export const CHAT_ACTION_FILE_NAME = z.string().regex(/^[A-Za-z0-9_.-]{1,80}$/u);

export const CHAT_ACTION_FILE_RUN = z.string().min(1).max(200);

export const CHAT_ACTION_FILE_FOLDER = 'action-files';
