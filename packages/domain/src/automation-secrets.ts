import { z } from 'zod';

const NAME_MAX = 80;

export const SECRET_REF = z.strictObject({ secret: z.uuid() });

export type SecretRef = z.infer<typeof SECRET_REF>;

export const AUTOMATION_SECRET_NAME = z
  .string()
  .trim()
  .min(1, 'a secret needs a name')
  .max(NAME_MAX, `a secret name is at most ${String(NAME_MAX)} characters`);

export const AUTOMATION_SECRET_ENTRY = z.strictObject({
  id: z.uuid(),
  name: AUTOMATION_SECRET_NAME,
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export type AutomationSecretEntry = z.infer<typeof AUTOMATION_SECRET_ENTRY>;

export const AUTOMATION_SECRET_INPUT = z.strictObject({
  name: AUTOMATION_SECRET_NAME,
  value: z.string().min(1, 'a secret needs a value').max(8192),
});

export type AutomationSecretInput = z.infer<typeof AUTOMATION_SECRET_INPUT>;

export const AUTOMATION_SECRET_USER = z.strictObject({
  automationId: z.uuid(),
  name: z.string(),
});

export type AutomationSecretUser = z.infer<typeof AUTOMATION_SECRET_USER>;
