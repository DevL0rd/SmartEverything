import { z } from 'zod';

export const CHAT_FILE_SEND_INPUT = z.strictObject({
  path: z
    .string()
    .refine((path) => path.startsWith('/') && !path.includes('..'), {
      message: 'must be an absolute path',
    })
    .describe('The absolute path of the file to send, on the computer running the hub'),
  name: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe('The name people see when they download it; the file’s own name when left out'),
  what: z.string().trim().min(1).max(300).describe('A sentence saying what the file is'),
  link: z
    .boolean()
    .optional()
    .describe(
      'Use a public four-hour download link for explicit external sharing or large files; otherwise attach privately in the chat',
    ),
});

export type ChatFileSendInput = z.infer<typeof CHAT_FILE_SEND_INPUT>;
