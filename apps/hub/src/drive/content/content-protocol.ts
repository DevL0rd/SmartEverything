import { z } from 'zod';
import { OCR_LANGUAGE } from '@smarteverything/domain';

const COUNT = z.int().nonnegative();

export const CONTENT_REQUEST = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('document'),
    id: COUNT,
    path: z.string().min(1),
    name: z.string().min(1),
    mime: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal('image'),
    id: COUNT,
    path: z.string().min(1),
    languages: z.array(OCR_LANGUAGE).min(1),
    languageDirectory: z.string().min(1),
  }),
]);

export type ContentRequest = z.infer<typeof CONTENT_REQUEST>;

export const CONTENT_RESPONSE = z.strictObject({
  id: COUNT,
  result: z.discriminatedUnion('state', [
    z.strictObject({ state: z.literal('ok'), body: z.string().min(1) }),
    z.strictObject({ state: z.literal('empty') }),
    z.strictObject({ state: z.literal('unsupported'), reason: z.string().min(1) }),
    z.strictObject({ state: z.literal('failed'), reason: z.string().min(1) }),
  ]),
});

export type ContentResponse = z.infer<typeof CONTENT_RESPONSE>;
