import { z } from 'zod';
import type { Channels } from '../channels';
import { DiscordInputError } from '../errors';
import { SNOWFLAKE } from '../ids';
import type { DiscordRest } from '../link';
import type { EventOrigin } from '../origins';
import type { Policy } from '../policy';
import { RAW_MESSAGE, type RawMessage } from '../payloads';

export type OperationMode = 'read' | 'change' | 'remove';

export interface OperationContext {
  readonly rest: DiscordRest;
  readonly policy: Policy;
  readonly channels: Channels;
  readonly botId: string;
  readonly applicationId: string;
  readonly origin: EventOrigin | null;
}

export interface Operation {
  readonly action: string;
  readonly mode: OperationMode;
  readonly target: 'guild' | 'channel';
  readonly description: string;
  readonly shape: z.ZodRawShape;
  readonly run: (raw: unknown, context: OperationContext) => Promise<unknown>;
}

interface Access {
  readonly target: 'guild' | 'channel';
}

export const ON_GUILD = { target: 'guild' } as const;
export const ON_CHANNEL = { target: 'channel' } as const;
export const channel = { channelId: SNOWFLAKE };
export const guild = { guildId: SNOWFLAKE };
export const member = { ...guild, userId: SNOWFLAKE };
export const message = { ...channel, messageId: SNOWFLAKE };
export const pagination = {
  limit: z.number().int().min(1).max(100).default(25),
  before: SNOWFLAKE.optional(),
};
export const forwardPagination = {
  limit: z.number().int().min(1).max(100).default(25),
  after: SNOWFLAKE.optional(),
};
export const shortName = z.string().min(1).max(100);
export const reason = z.string().min(1).max(300);
export const text = z.string().min(1).max(2000);

export function query(input: Readonly<Record<string, unknown>>): URLSearchParams {
  return new URLSearchParams(
    Object.entries(input)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, String(value)]),
  );
}

export function originOf(context: OperationContext): EventOrigin {
  if (context.origin === null) {
    throw new DiscordInputError(
      'This action answers a Discord request: pass the eventId of the request it belongs to',
    );
  }
  return context.origin;
}

interface Meta extends Access {
  readonly action: string;
  readonly description: string;
}

export function define<S extends z.ZodRawShape>(
  mode: OperationMode,
  meta: Meta,
  shape: S,
  run: (input: z.output<z.ZodObject<S>>, context: OperationContext) => Promise<unknown>,
): Operation {
  const schema = z.strictObject(shape);
  return {
    ...meta,
    mode,
    shape,
    run: (raw, context) => run(schema.parse(raw), context),
  };
}

export async function fetchMessage(
  context: OperationContext,
  channelId: string,
  messageId: string,
): Promise<RawMessage> {
  const found = RAW_MESSAGE.parse(
    await context.rest.get(`/channels/${channelId}/messages/${messageId}`),
  );
  if (found.author.id !== context.botId) {
    context.policy.assertUser(found.author.id);
  }
  return found;
}
