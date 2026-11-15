import { z } from 'zod';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

export const MAIL_SECURITIES = ['tls', 'starttls', 'none'] as const;

export type MailSecurity = (typeof MAIL_SECURITIES)[number];

export const MAIL_KINDS = ['invite', 'update', 'cancel', 'booking_confirmation', 'test'] as const;

export type MailKind = (typeof MAIL_KINDS)[number];

export const MAIL_OUTCOMES = ['sent', 'failed'] as const;

const SETTINGS_FIELDS = {
  host: z.string().trim().min(1),
  port: z.int().min(1).max(65535),
  security: z.enum(MAIL_SECURITIES),
  user: z.string().min(1).nullable(),
  from_name: z.string().trim().min(1).nullable(),
  from_address: z.email(),
} as const;

export const MAIL_SETTINGS = z
  .strictObject({ ...SETTINGS_FIELDS, password_set: z.boolean() })
  .superRefine((settings, context) => {
    if (settings.user === null && settings.password_set) {
      context.addIssue({
        code: 'custom',
        path: ['password_set'],
        message: 'a password belongs to a user name',
      });
    }
  })
  .readonly();

export type MailSettings = z.infer<typeof MAIL_SETTINGS>;

export const MAIL_PASSWORD_CHANGE = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('keep') }),
  z.strictObject({ action: z.literal('set'), value: z.string().min(1) }),
  z.strictObject({ action: z.literal('clear') }),
]);

export const MAIL_SETTINGS_WRITE = z
  .strictObject({ ...SETTINGS_FIELDS, password: MAIL_PASSWORD_CHANGE })
  .superRefine((settings, context) => {
    if (settings.user === null && settings.password.action === 'set') {
      context.addIssue({
        code: 'custom',
        path: ['password'],
        message: 'a password needs a user name',
      });
    }
  });

export type MailSettingsWrite = z.infer<typeof MAIL_SETTINGS_WRITE>;

export const MAIL_TEST_BODY = z.strictObject({ to: z.email() });

export const MAIL_TEST_RESULT = z.discriminatedUnion('outcome', [
  z.strictObject({ outcome: z.literal('sent') }),
  z.strictObject({ outcome: z.literal('failed'), detail: z.string().min(1) }),
]);

export type MailTestResult = z.infer<typeof MAIL_TEST_RESULT>;

export const MAIL_LOG_ROW = z
  .strictObject({
    id: ID,
    kind: z.enum(MAIL_KINDS),
    to_hash: z.string().regex(/^[0-9a-f]{64}$/),
    subject: z.string().min(1),
    outcome: z.enum(MAIL_OUTCOMES),
    detail: z.string().min(1).nullable(),
    at: MOMENT,
  })
  .superRefine((row, context) => {
    if ((row.outcome === 'failed') !== (row.detail !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['detail'],
        message: 'a failed mail carries its reason and a sent one none',
      });
    }
  })
  .readonly();

export type MailLogRow = z.infer<typeof MAIL_LOG_ROW>;
