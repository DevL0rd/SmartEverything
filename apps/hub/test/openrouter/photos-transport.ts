import { z } from 'zod';

export const SENT_BODY = z.looseObject({
  model: z.string(),
  input: z.array(z.unknown()).optional(),
  messages: z.array(z.looseObject({ content: z.array(z.looseObject({})) })).optional(),
});

export type SentBody = z.infer<typeof SENT_BODY>;

export function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

export async function bodyOf(init: Parameters<typeof fetch>[1]): Promise<SentBody> {
  const body = init?.body;
  if (typeof body === 'string') return SENT_BODY.parse(JSON.parse(body));
  if (body instanceof Blob) return SENT_BODY.parse(JSON.parse(await body.text()));
  throw new Error('The request has no JSON body.');
}

export function contentOf(body: SentBody): readonly Record<string, unknown>[] {
  return body.messages?.[0]?.content ?? [];
}
