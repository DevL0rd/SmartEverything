import { z } from 'zod';
import { JSON_VALUE } from './values';

export const WAKE_INSTRUCTION_MAX = 4000;

export const WAKE_AI_ACTION = z
  .object({
    type: z.literal('wake_ai'),
    profileId: z.uuid().describe('Whose AI wakes up; the chat belongs to this person'),
    chatId: z
      .uuid()
      .nullable()
      .default(null)
      .describe('The chat that wakes up; null starts a new chat'),
    instruction: z
      .string()
      .trim()
      .min(1)
      .max(WAKE_INSTRUCTION_MAX)
      .describe('What the AI should do; it also gets what happened and its values'),
  })
  .describe('Wakes the AI in a chat with what happened, so it can decide what to do');

export type WakeAiAction = z.output<typeof WAKE_AI_ACTION>;

export const TOOL_ACTION = z
  .object({
    type: z.literal('tool'),
    profileId: z.uuid().describe('The person the tool acts for'),
    tool: z.string().min(1).max(120).describe('Any tool name, e.g. call_person'),
    args: z.record(z.string(), JSON_VALUE).default({}).describe('The tool’s arguments'),
  })
  .describe(
    'Calls one tool without an AI turn; tools that need a person to confirm them are refused',
  );

export type ToolAction = z.output<typeof TOOL_ACTION>;

export const AI_ACTION_TYPES: ReadonlySet<string> = new Set(['wake_ai', 'tool']);

export const AI_WAKE_STATES = ['woke', 'refused', 'failed'] as const;

export type AiWakeState = (typeof AI_WAKE_STATES)[number];

const ID = z.uuid();

export const AI_WAKE_ROW = z.strictObject({
  id: ID,
  profile_id: ID,
  chat_id: ID.nullable(),
  automation_id: ID.nullable(),
  automation_name: z.string().min(1).max(120),
  headline: z.string().min(1).max(300),
  instruction: z.string().max(WAKE_INSTRUCTION_MAX),
  state: z.enum(AI_WAKE_STATES),
  reason: z.string().max(400).nullable(),
  created_at: z.iso.datetime({ offset: true }),
});

export type AiWakeRow = z.infer<typeof AI_WAKE_ROW>;
