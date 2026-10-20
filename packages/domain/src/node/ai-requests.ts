import { z } from 'zod';
import {
  AI_NATIVE_COMMAND_SCOPE,
  AI_NATIVE_COMMAND_DISPATCH,
  AI_NATIVE_COMMAND_WRITE,
  AI_NATIVE_COMMAND_READ,
  AI_NATIVE_COMMAND_CATALOGUE,
  AI_NATIVE_COMMAND_RECEIPT,
} from '../ai-native-commands';
import {
  PROVIDER_CONTROL,
  PROVIDER_FILE_MATCHES,
  PROVIDER_FILE_SEARCH,
  PROVIDER_METADATA,
  PROVIDER_READ_QUERY,
} from './provider-controls';
import { JSON_VALUE } from '../values';
import {
  CLAUDE_ANSWER,
  CLAUDE_OPERATION,
  CLAUDE_OPERATION_ACCEPTED,
  CLAUDE_CONTROL,
  CLAUDE_CONTROLLED,
  CLAUDE_CONTROLLER,
  CLAUDE_CONTROLLER_REGISTRATION,
  CLAUDE_LINK,
  CLAUDE_PROMPT,
  CLAUDE_PROMPT_ID,
  CLAUDE_SESSION,
  CLAUDE_SESSION_ID,
  CLAUDE_SESSION_LIST_MAX,
  CLAUDE_SESSION_STATE,
  CLAUDE_START,
  CLAUDE_STARTED,
  CLAUDE_STATUS,
  CLAUDE_THREAD_CURSOR,
  CLAUDE_THREAD_PAGE,
  CLAUDE_USAGE,
} from '../claude';
import {
  COMPUTER_AI_CAPABILITIES,
  COMPUTER_AI_NATIVE_TOOL,
  COMPUTER_AI_MODEL,
  COMPUTER_AI_SETTINGS,
} from '../computer-ai';
import {
  PROVIDER_ACCEPTED,
  PROVIDER_TURN,
  PROVIDER_ANSWER,
  PROVIDER_CONTENT,
} from './provider-turns';

export const COMPUTER_AI_READ = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('provider_commands'), scope: AI_NATIVE_COMMAND_SCOPE }),
  AI_NATIVE_COMMAND_READ.extend({ operation: z.literal('provider_command_receipt') }),
  PROVIDER_FILE_SEARCH.extend({ operation: z.literal('provider_files') }),
  z.strictObject({ operation: z.literal('native_operation'), operation_id: z.uuid() }),
  z.strictObject({ operation: z.literal('status') }),
  z.strictObject({ operation: z.literal('models') }),
  z.strictObject({ operation: z.literal('provider_metadata'), job_id: z.uuid().optional() }),
  z.strictObject({
    operation: z.literal('provider_read'),
    job_id: z.uuid(),
    query: PROVIDER_READ_QUERY,
  }),
  z.strictObject({
    operation: z.literal('native_tools_list'),
    session_id: CLAUDE_SESSION_ID.optional(),
  }),
  z.strictObject({
    operation: z.literal('sessions'),
    query: z.strictObject({
      state: CLAUDE_SESSION_STATE.optional(),
      archived: z.boolean().default(false),
      limit: z.int().min(1).max(CLAUDE_SESSION_LIST_MAX).default(100),
    }),
  }),
  z.strictObject({ operation: z.literal('session'), session_id: CLAUDE_SESSION_ID }),
  z.strictObject({
    operation: z.literal('thread'),
    session_id: CLAUDE_SESSION_ID,
    query: z.strictObject({
      before: CLAUDE_THREAD_CURSOR.optional(),
      limit: z.int().min(1).max(200).default(50),
    }),
  }),
  z.strictObject({ operation: z.literal('usage') }),
  z.strictObject({ operation: z.literal('prompts'), session_id: CLAUDE_SESSION_ID.optional() }),
]);
export type ComputerAiRead = z.infer<typeof COMPUTER_AI_READ>;
export const COMPUTER_AI_EXECUTE = z.discriminatedUnion('operation', [
  AI_NATIVE_COMMAND_WRITE.extend({ operation: z.literal('provider_command') }),
  AI_NATIVE_COMMAND_DISPATCH.extend({ operation: z.literal('provider_command_dispatch') }),
  z.strictObject({
    operation: z.literal('control'),
    operation_id: z.uuid().optional(),
    session_id: CLAUDE_SESSION_ID,
    control: CLAUDE_CONTROL,
  }),
  z.strictObject({
    operation: z.literal('start'),
    operation_id: z.uuid().optional(),
    start: CLAUDE_START,
  }),
  z.strictObject({
    operation: z.literal('native_tools_call'),
    operation_id: z.uuid().optional(),
    session_id: CLAUDE_SESSION_ID,
    name: z.string().min(1).max(200),
    arguments: z.record(z.string(), JSON_VALUE),
  }),
  z.strictObject({ operation: z.literal('install_link') }),
  z.strictObject({ operation: z.literal('remove_link') }),
  z.strictObject({ operation: z.literal('register_controller') }),
  z.strictObject({ operation: z.literal('remove_controller') }),
  z.strictObject({
    operation: z.literal('answer'),
    prompt_id: CLAUDE_PROMPT_ID,
    answer: CLAUDE_ANSWER,
    requester: z.enum(['owner', 'ai']),
  }),
  z.strictObject({ operation: z.literal('configure'), settings: COMPUTER_AI_SETTINGS }),
  z.strictObject({ operation: z.literal('provider_start'), turn: PROVIDER_TURN }),
  z.strictObject({
    operation: z.literal('provider_control'),
    job_id: z.uuid(),
    control: PROVIDER_CONTROL,
  }),
  z.strictObject({ operation: z.literal('provider_interrupt'), job_id: z.uuid() }),
  z.strictObject({
    operation: z.literal('provider_steer'),
    job_id: z.uuid(),
    content: z.array(PROVIDER_CONTENT).min(1).max(64),
  }),
  z.strictObject({
    operation: z.literal('provider_adopt'),
    session_id: CLAUDE_SESSION_ID,
    chat_id: z.uuid(),
    profile_id: z.uuid(),
    cwd: z.string().min(1).max(4096),
  }),
  z.strictObject({
    operation: z.literal('provider_tool_result'),
    job_id: z.uuid(),
    call_id: z.string().min(1).max(200),
    text: z.string().max(200_000),
    content: z.array(PROVIDER_CONTENT).max(64).optional(),
    failed: z.boolean(),
  }),
  z.strictObject({
    operation: z.literal('provider_answer'),
    job_id: z.uuid(),
    prompt_id: z.string().min(1).max(200),
    answer: PROVIDER_ANSWER,
  }),
]);
export type ComputerAiExecute = z.infer<typeof COMPUTER_AI_EXECUTE>;
export type ComputerAiRequest = ComputerAiRead | ComputerAiExecute;
export const COMPUTER_AI_REPLY = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('provider_commands'), value: AI_NATIVE_COMMAND_CATALOGUE }),
  z.strictObject({ operation: z.literal('provider_files'), value: PROVIDER_FILE_MATCHES }),
  z.strictObject({ operation: z.literal('provider_command'), value: AI_NATIVE_COMMAND_RECEIPT }),
  z.strictObject({
    operation: z.literal('provider_command_dispatch'),
    value: AI_NATIVE_COMMAND_RECEIPT,
  }),
  z.strictObject({
    operation: z.literal('provider_command_receipt'),
    value: AI_NATIVE_COMMAND_RECEIPT,
  }),
  z.strictObject({ operation: z.literal('native_operation'), value: CLAUDE_OPERATION }),
  z.strictObject({
    operation: z.literal('status'),
    value: z.strictObject({ native: CLAUDE_STATUS, capabilities: COMPUTER_AI_CAPABILITIES }),
  }),
  z.strictObject({
    operation: z.literal('native_tools_list'),
    value: z.array(COMPUTER_AI_NATIVE_TOOL).max(500),
  }),
  z.strictObject({ operation: z.literal('native_tools_call'), value: JSON_VALUE }),
  z.strictObject({ operation: z.literal('models'), value: z.array(COMPUTER_AI_MODEL) }),
  z.strictObject({ operation: z.literal('sessions'), value: z.array(CLAUDE_SESSION) }),
  z.strictObject({ operation: z.literal('session'), value: CLAUDE_SESSION }),
  z.strictObject({ operation: z.literal('thread'), value: CLAUDE_THREAD_PAGE }),
  z.strictObject({ operation: z.literal('usage'), value: CLAUDE_USAGE }),
  z.strictObject({ operation: z.literal('prompts'), value: z.array(CLAUDE_PROMPT) }),
  z.strictObject({
    operation: z.literal('control'),
    value: z.union([CLAUDE_CONTROLLED, CLAUDE_OPERATION_ACCEPTED]),
  }),
  z.strictObject({
    operation: z.literal('start'),
    value: z.union([CLAUDE_STARTED, CLAUDE_OPERATION_ACCEPTED]),
  }),
  z.strictObject({ operation: z.literal('install_link'), value: CLAUDE_LINK }),
  z.strictObject({ operation: z.literal('remove_link'), value: CLAUDE_LINK }),
  z.strictObject({
    operation: z.literal('register_controller'),
    value: CLAUDE_CONTROLLER_REGISTRATION,
  }),
  z.strictObject({ operation: z.literal('remove_controller'), value: CLAUDE_CONTROLLER }),
  z.strictObject({ operation: z.literal('answer'), value: CLAUDE_PROMPT }),
  z.strictObject({ operation: z.literal('configure'), value: COMPUTER_AI_SETTINGS }),
  z.strictObject({ operation: z.literal('provider_metadata'), value: PROVIDER_METADATA }),
  z.strictObject({ operation: z.literal('provider_read'), value: JSON_VALUE }),
  z.strictObject({ operation: z.literal('provider_control'), value: JSON_VALUE }),
  z.strictObject({ operation: z.literal('provider_start'), value: PROVIDER_ACCEPTED }),
  z.strictObject({
    operation: z.literal('provider_tool_result'),
    value: z.strictObject({ delivered: z.boolean() }),
  }),
  z.strictObject({
    operation: z.literal('provider_interrupt'),
    value: z.strictObject({ interrupted: z.boolean() }),
  }),
  z.strictObject({
    operation: z.literal('provider_steer'),
    value: z.strictObject({ steered: z.boolean() }),
  }),
  z.strictObject({
    operation: z.literal('provider_adopt'),
    value: z.strictObject({ session_id: CLAUDE_SESSION_ID }),
  }),
  z.strictObject({
    operation: z.literal('provider_answer'),
    value: z.strictObject({ answered: z.boolean() }),
  }),
]);
export type ComputerAiReply = z.infer<typeof COMPUTER_AI_REPLY>;
