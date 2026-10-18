import { z } from 'zod';

export const JSON_TEXT = z.string().transform((text, context): unknown => {
  try {
    return JSON.parse(text);
  } catch (cause) {
    context.issues.push({ code: 'custom', message: String(cause), input: text });
    return z.NEVER;
  }
});
