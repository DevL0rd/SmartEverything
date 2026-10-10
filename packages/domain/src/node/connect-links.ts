import { z } from 'zod';

export const CONNECT_KINDS = ['ssh', 'rdp', 'vnc', 'moonlight'] as const;

export type ConnectKind = (typeof CONNECT_KINDS)[number];

export const CONNECT_LINK = z.strictObject({
  kind: z.enum(CONNECT_KINDS),
  host: z.string().min(1),
  port: z.int().min(1).max(65_535),
  user: z.string().min(1).nullable(),
  url: z.string().min(1).nullable(),
});

export type ConnectLink = z.infer<typeof CONNECT_LINK>;
