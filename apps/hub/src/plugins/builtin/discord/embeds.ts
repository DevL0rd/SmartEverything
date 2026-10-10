import { z } from 'zod';

const FIELD = z.strictObject({
  name: z.string().min(1).max(256),
  value: z.string().min(1).max(1024),
  inline: z.boolean().optional(),
});

const EMBED = z.strictObject({
  title: z.string().max(256).optional(),
  description: z.string().max(4096).optional(),
  url: z.url().optional(),
  color: z.number().int().min(0).max(0xffffff).optional(),
  fields: z.array(FIELD).max(25).optional(),
  footer: z.strictObject({ text: z.string().min(1).max(2048) }).optional(),
  image: z.strictObject({ url: z.url() }).optional(),
  thumbnail: z.strictObject({ url: z.url() }).optional(),
  timestamp: z.iso.datetime().optional(),
});

export type Embed = z.output<typeof EMBED>;

const EMBED_CHARACTERS = 6000;

function embedLength(item: Embed): number {
  return (
    (item.title?.length ?? 0) +
    (item.description?.length ?? 0) +
    (item.footer?.text.length ?? 0) +
    (item.fields ?? []).reduce((total, field) => total + field.name.length + field.value.length, 0)
  );
}

export const EMBEDS = z
  .array(EMBED)
  .max(10)
  .refine(
    (items) => items.reduce((total, item) => total + embedLength(item), 0) <= EMBED_CHARACTERS,
    {
      message:
        'Embeds can hold at most 6000 characters in total; split the content across messages',
    },
  );

export const CONTENT = z.string().max(8000);
