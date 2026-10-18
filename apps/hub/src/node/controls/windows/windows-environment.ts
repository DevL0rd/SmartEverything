import { env } from 'node:process';
import { z } from 'zod';

const WINDOWS_ENVIRONMENT = z.object({
  LOCALAPPDATA: z
    .string()
    .optional()
    .transform((value) => (value === undefined || value === '' ? null : value)),
});

export function localAppData(): string | null {
  return WINDOWS_ENVIRONMENT.parse(env).LOCALAPPDATA;
}
