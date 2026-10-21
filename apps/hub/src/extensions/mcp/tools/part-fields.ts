import type { McpPartName } from '@smarteverything/domain';
import { z } from 'zod';
import { ToolError, type ToolContext } from './registry';

type Args = Readonly<Record<string, unknown>>;

type Fields = Readonly<Record<string, z.ZodType>>;

const CHAT = 'chatId';

export interface PartFields {
  readonly callingChat?: true;
  readonly targetChat?: string;
  readonly fixed?: Readonly<Record<string, unknown>>;
  readonly hidden?: Readonly<Record<string, string>>;
  readonly described?: Readonly<Record<string, string>>;
}

const FROM_CHAT = 'chat_read gives the chat ids';

export const PART_FIELDS: Readonly<Partial<Record<McpPartName, PartFields>>> = {
  generate_image_operation: { callingChat: true },
  edit_image_operation: { callingChat: true },
  list_image_endpoints: { callingChat: true },
  subagent_run: { callingChat: true },
  machine_read: { callingChat: true },
  machine_switch: { callingChat: true },
  tool_result_read: {
    callingChat: true,
    described: {
      callId: 'The id of the earlier tool call whose output or input was clipped, as shown with that call',
    },
  },
  chat_send: {
    targetChat: `The chat to message, its chatId (${FROM_CHAT}); never the chat you are in`,
  },
  chat_retry: { fixed: { from: 'failed' } },
  chat_delete: {
    hidden: { expectedInactiveRunId: 'the app sets it; delete a chat with chatId only' },
  },
  chats_list: {
    described: {
      archived: 'true for archived chats only; left out, the live ones',
      pinned: 'true for pinned chats only',
      unread: 'true for unread chats only',
    },
  },
  chats_search: { described: { archived: 'true to search archived chats only' } },
  chat_update: {
    described: {
      pinned: 'true pins the chat, false unpins it',
      archived: 'true archives the chat, false brings it back',
    },
  },
};

export function hiddenFields(name: McpPartName): readonly string[] {
  const fields = PART_FIELDS[name];
  return [
    ...(fields?.callingChat === true ? [CHAT] : []),
    ...Object.keys(fields?.hidden ?? {}),
    ...Object.keys(fields?.fixed ?? {}),
  ];
}

export function shapedFields(name: McpPartName, kept: Fields): Fields {
  const fields = PART_FIELDS[name];
  if (fields === undefined) {
    return kept;
  }
  return Object.fromEntries(
    Object.entries(kept).map(([field, schema]) => {
      const text = fields.described?.[field];
      if (field === CHAT && fields.targetChat !== undefined) {
        return [field, z.uuid().describe(fields.targetChat)];
      }
      return [field, text === undefined ? schema : schema.describe(text)];
    }),
  );
}

export function checkedFields(name: McpPartName, args: Args): void {
  const fields = PART_FIELDS[name];
  if (fields === undefined) {
    return;
  }
  if (fields.callingChat === true && args[CHAT] !== undefined) {
    throw new ToolError(`${name} always works on the chat you call it from; leave ${CHAT} out`);
  }
  for (const [field, why] of Object.entries(fields.hidden ?? {})) {
    if (args[field] !== undefined) {
      throw new ToolError(`${name} does not take ${field}: ${why}`);
    }
  }
  if (fields.targetChat !== undefined && args[CHAT] === undefined) {
    throw new ToolError(`${name} needs ${CHAT}: ${fields.targetChat}`);
  }
}

export function filledFields(
  name: McpPartName,
  context: Pick<ToolContext, 'actor'>,
  args: Args,
): Args {
  const fields = PART_FIELDS[name];
  if (fields === undefined) {
    return args;
  }
  const fixed = { ...args, ...fields.fixed };
  if (fields.callingChat !== true) {
    return fixed;
  }
  const chatId = context.actor?.chatId ?? null;
  if (chatId === null) {
    throw new ToolError(`${name} works inside a chat; call it from a chat, not from outside one`);
  }
  return { ...fixed, [CHAT]: chatId };
}
