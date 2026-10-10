import { z } from 'zod';
import { SNOWFLAKE } from './ids';

export const THREAD_TYPES: ReadonlySet<number> = new Set([10, 11, 12]);

export const READABLE_TYPES: ReadonlySet<number> = new Set([0, 5, 10, 11, 12]);

export const RAW_USER = z.looseObject({
  id: SNOWFLAKE,
  username: z.string().nullish(),
  global_name: z.string().nullish(),
  bot: z.boolean().optional(),
});

export type RawUser = z.output<typeof RAW_USER>;

export const RAW_MEMBER = z.looseObject({
  nick: z.string().nullish(),
  roles: z.array(SNOWFLAKE).default([]),
  user: RAW_USER.optional(),
});

export type RawMember = z.output<typeof RAW_MEMBER>;

const RAW_ATTACHMENT = z.looseObject({
  id: SNOWFLAKE,
  filename: z.string().min(1).max(256),
  size: z.number().int().min(0),
  content_type: z.string().max(100).nullish(),
  url: z.string(),
  width: z.number().nullish(),
  height: z.number().nullish(),
});

export type RawAttachment = z.output<typeof RAW_ATTACHMENT>;

const MENTIONED = RAW_USER.extend({ member: RAW_MEMBER.optional() });

export const RAW_MESSAGE = z.looseObject({
  id: SNOWFLAKE,
  channel_id: SNOWFLAKE,
  guild_id: SNOWFLAKE.optional(),
  content: z.string().default(''),
  timestamp: z.string(),
  author: RAW_USER,
  member: RAW_MEMBER.optional(),
  webhook_id: SNOWFLAKE.optional(),
  mentions: z.array(MENTIONED).default([]),
  mention_roles: z.array(SNOWFLAKE).default([]),
  message_reference: z
    .looseObject({
      message_id: SNOWFLAKE.optional(),
      channel_id: SNOWFLAKE.optional(),
      guild_id: SNOWFLAKE.optional(),
    })
    .optional(),
  attachments: z.array(RAW_ATTACHMENT).default([]),
});

export type RawMessage = z.output<typeof RAW_MESSAGE>;

export const MESSAGE_UPDATE = z.looseObject({
  id: SNOWFLAKE,
  channel_id: SNOWFLAKE,
  guild_id: SNOWFLAKE.optional(),
  content: z.string().optional(),
  attachments: z.array(RAW_ATTACHMENT).optional(),
  author: RAW_USER.optional(),
});

export const MESSAGE_DELETE = z.looseObject({ id: SNOWFLAKE });

export const MESSAGE_DELETE_BULK = z.looseObject({ ids: z.array(SNOWFLAKE) });

export const RAW_CHANNEL = z.looseObject({
  id: SNOWFLAKE,
  type: z.number().int(),
  guild_id: SNOWFLAKE.optional(),
  parent_id: SNOWFLAKE.nullish(),
  name: z.string().nullish(),
});

export type RawChannel = z.output<typeof RAW_CHANNEL>;

export const GUILD_CREATE = z.looseObject({
  id: SNOWFLAKE,
  channels: z.array(RAW_CHANNEL).default([]),
  threads: z.array(RAW_CHANNEL).default([]),
});

export const GUILD_MEMBER_UPDATE = z.looseObject({
  guild_id: SNOWFLAKE,
  roles: z.array(SNOWFLAKE).default([]),
  user: RAW_USER,
  nick: z.string().nullish(),
});

export const GUILD_MEMBER_REMOVE = z.looseObject({ guild_id: SNOWFLAKE, user: RAW_USER });

export const READY = z.looseObject({
  user: RAW_USER,
  application: z.looseObject({ id: SNOWFLAKE }),
  guilds: z.array(z.looseObject({ id: SNOWFLAKE })).default([]),
});

const OPTION = z.looseObject({ name: z.string(), value: z.unknown().optional() });

interface InputField {
  readonly custom_id: string;
  readonly value: string;
}

const INPUT_FIELD: z.ZodType<InputField> = z.looseObject({
  custom_id: z.string(),
  value: z.string(),
});

export interface ComponentNode {
  readonly components?: readonly ComponentNode[] | undefined;
  readonly component?: ComponentNode | undefined;
  readonly custom_id?: string | undefined;
  readonly value?: string | undefined;
}

const COMPONENT_NODE: z.ZodType<ComponentNode> = z.lazy(() =>
  z.looseObject({
    components: z.array(COMPONENT_NODE).optional(),
    component: COMPONENT_NODE.optional(),
    custom_id: z.string().optional(),
    value: z.string().optional(),
  }),
);

export function inputFieldsOf(nodes: readonly ComponentNode[]): InputField[] {
  return nodes.flatMap((node) => {
    const own = INPUT_FIELD.safeParse(node);
    return [
      ...(own.success ? [own.data] : []),
      ...inputFieldsOf(node.components ?? []),
      ...(node.component === undefined ? [] : inputFieldsOf([node.component])),
    ];
  });
}

export const RAW_INTERACTION = z.looseObject({
  id: SNOWFLAKE,
  application_id: SNOWFLAKE,
  token: z.string().min(1),
  type: z.number().int(),
  guild_id: SNOWFLAKE.optional(),
  channel_id: SNOWFLAKE.optional(),
  member: RAW_MEMBER.optional(),
  user: RAW_USER.optional(),
  message: z.looseObject({ id: SNOWFLAKE, author: z.looseObject({ id: SNOWFLAKE }) }).optional(),
  data: z
    .looseObject({
      name: z.string().optional(),
      custom_id: z.string().optional(),
      component_type: z.number().int().optional(),
      values: z.array(z.string()).optional(),
      options: z.array(OPTION).optional(),
      components: z.array(COMPONENT_NODE).optional(),
    })
    .optional(),
});

export type RawInteraction = z.output<typeof RAW_INTERACTION>;

export const INTERACTION_TYPES = { command: 2, component: 3, modal: 5 } as const;

export const POSTED = z.looseObject({ id: SNOWFLAKE, channel_id: SNOWFLAKE });

export type Posted = z.output<typeof POSTED>;
