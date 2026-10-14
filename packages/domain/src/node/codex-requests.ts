import { z } from 'zod';
import {
  AI_NATIVE_COMMAND_SCOPE,
  AI_NATIVE_COMMAND_DISPATCH,
  AI_NATIVE_COMMAND_CATALOGUE,
  AI_NATIVE_COMMAND_WRITE,
  AI_NATIVE_COMMAND_READ,
  AI_NATIVE_COMMAND_RECEIPT,
} from '../ai-native-commands';
import {
  CODEX_AI_SETTINGS,
  CODEX_ID,
  CODEX_OPERATION,
  CODEX_SESSION,
  CODEX_SESSION_PAGE,
  CODEX_THREAD_PAGE,
  CODEX_USAGE,
  CODEX_PROVIDER_OPTIONS,
} from '../codex';
import { CODEX_ANSWER, CODEX_PROMPT } from '../codex-prompts';
import { COMPUTER_RUNTIME_CAPABILITIES, COMPUTER_RUNTIME_MODEL } from '../computer-ai-runtime';
import { JSON_VALUE } from '../values';
import { PROVIDER_ACCEPTED, PROVIDER_CONTENT } from './provider-turns';
import {
  CODEX_PROVIDER_TURN,
  CODEX_PROVIDER_CONTROL,
  CODEX_PROVIDER_READ_QUERY,
  CODEX_PROVIDER_METADATA,
} from './runtime-provider';

export const CODEX_COMMAND_CONFIGURATION = CODEX_PROVIDER_TURN.pick({
  model: true,
  effort: true,
  options: true,
  tools: true,
});
export type CodexCommandConfiguration = z.infer<typeof CODEX_COMMAND_CONFIGURATION>;

export const CODEX_AI_READ = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('status') }),
  z.strictObject({ operation: z.literal('provider_commands'), scope: AI_NATIVE_COMMAND_SCOPE }),
  z.strictObject({
    operation: z.literal('provider_command_receipt'),
    ...AI_NATIVE_COMMAND_READ.shape,
  }),
  z.strictObject({ operation: z.literal('models') }),
  z.strictObject({ operation: z.literal('native_operation'), operation_id: z.uuid() }),
  z.strictObject({
    operation: z.literal('sessions'),
    query: z.strictObject({
      cursor: z.string().max(1000).optional(),
      archived: z.boolean().default(false),
      limit: z.int().min(1).max(200).default(100),
    }),
  }),
  z.strictObject({ operation: z.literal('session'), session_id: CODEX_ID }),
  z.strictObject({
    operation: z.literal('thread'),
    session_id: CODEX_ID,
    query: z.strictObject({
      cursor: z.string().max(1000).optional(),
      limit: z.int().min(1).max(200).default(50),
    }),
  }),
  z.strictObject({ operation: z.literal('usage') }),
  z.strictObject({ operation: z.literal('prompts'), session_id: CODEX_ID.optional() }),
  z.strictObject({ operation: z.literal('provider_metadata'), job_id: z.uuid().optional() }),
  z.strictObject({
    operation: z.literal('provider_read'),
    job_id: z.uuid(),
    query: CODEX_PROVIDER_READ_QUERY,
  }),
]);
export type CodexAiRead = z.infer<typeof CODEX_AI_READ>;
const RECEIPT = { operation_id: z.uuid() };
const SESSION = { ...RECEIPT, session_id: CODEX_ID };
export const CODEX_AI_EXECUTE = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('configure'), settings: CODEX_AI_SETTINGS }),
  z.strictObject({
    operation: z.literal('provider_command'),
    ...AI_NATIVE_COMMAND_WRITE.shape,
    configuration: CODEX_COMMAND_CONFIGURATION.optional(),
  }),
  AI_NATIVE_COMMAND_DISPATCH.extend({ operation: z.literal('provider_command_dispatch') }),
  z.strictObject({
    operation: z.literal('start'),
    ...RECEIPT,
    start: z.strictObject({
      model: CODEX_ID,
      effort: z.string().max(32).nullable(),
      text: z.string().min(1).max(200_000),
      options: CODEX_PROVIDER_OPTIONS,
    }),
  }),
  z.strictObject({ operation: z.literal('resume'), ...SESSION }),
  z.strictObject({
    operation: z.literal('send'),
    ...SESSION,
    text: z.string().min(1).max(200_000),
  }),
  z.strictObject({
    operation: z.literal('steer'),
    ...SESSION,
    expected_turn_id: CODEX_ID,
    text: z.string().min(1).max(200_000),
  }),
  z.strictObject({ operation: z.literal('interrupt'), ...SESSION, turn_id: CODEX_ID }),
  z.strictObject({ operation: z.literal('rename'), ...SESSION, title: z.string().min(1).max(500) }),
  z.strictObject({ operation: z.literal('fork'), ...SESSION }),
  z.strictObject({ operation: z.literal('archive'), ...SESSION }),
  z.strictObject({ operation: z.literal('unarchive'), ...SESSION }),
  z.strictObject({ operation: z.literal('delete'), ...SESSION }),
  z.strictObject({
    operation: z.literal('answer'),
    ...RECEIPT,
    prompt_id: CODEX_ID,
    answer: CODEX_ANSWER,
  }),
  z.strictObject({ operation: z.literal('provider_start'), turn: CODEX_PROVIDER_TURN }),
  z.strictObject({ operation: z.literal('provider_interrupt'), job_id: z.uuid() }),
  z.strictObject({
    operation: z.literal('provider_control'),
    job_id: z.uuid(),
    control: CODEX_PROVIDER_CONTROL,
  }),
  z.strictObject({
    operation: z.literal('provider_tool_result'),
    job_id: z.uuid(),
    call_id: CODEX_ID,
    text: z.string().max(200_000),
    content: z.array(PROVIDER_CONTENT).max(64).optional(),
    failed: z.boolean(),
  }),
  z.strictObject({
    operation: z.literal('provider_answer'),
    job_id: z.uuid(),
    prompt_id: CODEX_ID,
    answer: CODEX_ANSWER,
  }),
]);
export type CodexAiExecute = z.infer<typeof CODEX_AI_EXECUTE>;
const NATIVE_RESULT = z.strictObject({ native_operation: CODEX_OPERATION });
export const CODEX_AI_REPLY = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('provider_commands'), value: AI_NATIVE_COMMAND_CATALOGUE }),
  z.strictObject({
    operation: z.literal('provider_command_receipt'),
    value: AI_NATIVE_COMMAND_RECEIPT,
  }),
  z.strictObject({ operation: z.literal('provider_command'), value: AI_NATIVE_COMMAND_RECEIPT }),
  z.strictObject({
    operation: z.literal('provider_command_dispatch'),
    value: AI_NATIVE_COMMAND_RECEIPT,
  }),
  z.strictObject({
    operation: z.literal('status'),
    value: z.strictObject({ capabilities: COMPUTER_RUNTIME_CAPABILITIES, native: JSON_VALUE }),
  }),
  z.strictObject({
    operation: z.literal('models'),
    value: z.array(COMPUTER_RUNTIME_MODEL).max(500),
  }),
  z.strictObject({ operation: z.literal('native_operation'), value: CODEX_OPERATION }),
  z.strictObject({ operation: z.literal('sessions'), value: CODEX_SESSION_PAGE }),
  z.strictObject({ operation: z.literal('session'), value: CODEX_SESSION }),
  z.strictObject({ operation: z.literal('thread'), value: CODEX_THREAD_PAGE }),
  z.strictObject({ operation: z.literal('usage'), value: CODEX_USAGE }),
  z.strictObject({ operation: z.literal('prompts'), value: z.array(CODEX_PROMPT).max(500) }),
  ...(
    [
      'start',
      'resume',
      'send',
      'steer',
      'interrupt',
      'rename',
      'fork',
      'archive',
      'unarchive',
      'delete',
      'answer',
    ] as const
  ).map((operation) => z.strictObject({ operation: z.literal(operation), value: NATIVE_RESULT })),
  z.strictObject({ operation: z.literal('configure'), value: CODEX_AI_SETTINGS }),
  z.strictObject({ operation: z.literal('provider_start'), value: PROVIDER_ACCEPTED }),
  z.strictObject({ operation: z.literal('provider_metadata'), value: CODEX_PROVIDER_METADATA }),
  z.strictObject({ operation: z.literal('provider_read'), value: JSON_VALUE }),
  z.strictObject({ operation: z.literal('provider_control'), value: JSON_VALUE }),
  z.strictObject({
    operation: z.literal('provider_interrupt'),
    value: z.strictObject({ interrupted: z.boolean() }),
  }),
  z.strictObject({
    operation: z.literal('provider_tool_result'),
    value: z.strictObject({ delivered: z.boolean() }),
  }),
  z.strictObject({
    operation: z.literal('provider_answer'),
    value: z.strictObject({ answered: z.boolean() }),
  }),
]);
export type CodexAiReply = z.infer<typeof CODEX_AI_REPLY>;
