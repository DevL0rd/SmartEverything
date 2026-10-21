import {
  CLAUDE_CLI_OPTIONS,
  CLAUDE_CLI_RECEIPT,
  CLAUDE_CLI_SESSION,
  CLAUDE_SETTABLE_MODE,
  PROVIDER_ANSWER,
  type ClaudeCliAction,
  type ClaudeCliReceipt,
  type ClaudeCliSession,
} from '@smarteverything/domain';
import { z } from 'zod';
import { newImageOperationId } from '../../../assistant/image/call-operation';
import { StoreNotFoundError } from '../../../store/context';
import { operate } from './acting';
import { COMPUTER_ID, computerIdOf } from './computer-target';
import { READS, ToolError, WRITES, defineTool, type Tool, type ToolContext } from './registry';

type Fields = Record<string, unknown>;

const CHAT_ID = z
  .uuid()
  .describe('The Claude chat, the chatId from claude_read view cli_sessions or from start');

const MESSAGE = z.string().trim().min(1).describe('The message for Claude');

const ATTACHMENTS = z
  .array(z.uuid())
  .optional()
  .describe('Files attached to the chat to send along (attachmentId from chat_read view messages)');

const LIMIT = z.int().min(1).max(200).optional().describe('How many to return at most; 50 when left out');

function chatComputer(context: ToolContext, chatId: string): string {
  try {
    return context.store.claudeCliOperations.binding(chatId).device_id;
  } catch (cause) {
    if (cause instanceof StoreNotFoundError) {
      throw new ToolError(
        `${chatId} is not a Claude CLI chat; claude_read view cli_sessions lists them`,
        'not_found',
      );
    }
    throw cause;
  }
}

function sessionLine(session: ClaudeCliSession): Fields {
  const { chat, provider } = session;
  return {
    chatId: chat.id,
    title: chat.title,
    deviceId: provider.device_id,
    cwd: session.cwd,
    model: chat.engine.kind === 'claude' ? chat.engine.model : null,
    state: provider.state,
    running: provider.job_id !== null,
    online: session.online,
    waitingPrompts: provider.prompts.filter((prompt) => prompt.status === 'pending').length,
    archived: chat.archived_at !== null,
    updatedAt: chat.updated_at,
    ...(provider.reason === null ? {} : { reason: provider.reason }),
  };
}

function receiptLine(receipt: ClaudeCliReceipt): Fields {
  return {
    ok: receipt.state === 'accepted',
    chatId: receipt.chat_id,
    operationId: receipt.operation_id,
    action: receipt.action,
    state: receipt.state,
    ...(receipt.reason === null ? {} : { reason: receipt.reason }),
  };
}

async function sessionOf(
  context: ToolContext,
  chatId: string,
): Promise<{ readonly deviceId: string; readonly session: ClaudeCliSession }> {
  const deviceId = chatComputer(context, chatId);
  const session = CLAUDE_CLI_SESSION.parse(
    await operate(context, 'readClaudeCliSession', { params: { deviceId, chatId } }),
  );
  return { deviceId, session };
}

async function act(
  context: ToolContext,
  chatId: string,
  action: (current: {
    readonly operation_id: string;
    readonly session_id: string | null;
    readonly job_id: string | null;
  }) => ClaudeCliAction,
  check: (session: ClaudeCliSession) => void = () => undefined,
): Promise<Fields> {
  const { deviceId, session } = await sessionOf(context, chatId);
  check(session);
  const body = action({
    operation_id: newImageOperationId(context.actor?.callId),
    session_id: session.provider.session_id,
    job_id: session.provider.job_id,
  });
  const receipt = CLAUDE_CLI_RECEIPT.parse(
    await operate(context, 'controlClaudeCliSession', { params: { deviceId, chatId }, body }),
  );
  return receiptLine(receipt);
}

function running(session: ClaudeCliSession): boolean {
  return session.provider.state === 'working';
}

const DEVICE = z.strictObject({ deviceId: COMPUTER_ID });

function reads<I>(
  name: Parameters<typeof defineTool>[0]['name'],
  input: z.ZodType<I>,
  run: (context: ToolContext, request: I) => Promise<Fields>,
): Tool {
  return defineTool({
    name,
    input,
    annotations: READS,
    run: async (context, request) => ({ structured: await run(context, request) }),
  });
}

function writes<I>(
  name: Parameters<typeof defineTool>[0]['name'],
  input: z.ZodType<I>,
  run: (context: ToolContext, request: I) => Promise<Fields>,
  destructive = false,
): Tool {
  return defineTool({
    name,
    input,
    annotations: {
      ...WRITES,
      destructiveHint: destructive,
      idempotentHint: true,
      openWorldHint: true,
    },
    answer: true,
    run: async (context, request) => ({ structured: await run(context, request) }),
  });
}

async function listed(
  context: ToolContext,
  { deviceId, archived, limit }: z.output<typeof LIST>,
): Promise<Fields> {
  const id = computerIdOf(context, deviceId);
  const sessions = z
    .array(CLAUDE_CLI_SESSION)
    .parse(
      await operate(context, 'listClaudeCliSessions', {
        params: { deviceId: id },
        query: {
          ...(archived === undefined ? {} : { archived: String(archived) }),
          ...(limit === undefined ? {} : { limit: String(limit) }),
        },
      }),
    );
  return { count: sessions.length, sessions: sessions.map(sessionLine) };
}

const LIST = z.strictObject({
  deviceId: COMPUTER_ID,
  archived: z.boolean().optional().describe('true lists archived chats only; live chats when left out'),
  limit: LIMIT,
});

const SESSION = z.strictObject({ chatId: CHAT_ID });

const HISTORY = z.strictObject({
  chatId: CHAT_ID,
  before: z.iso
    .datetime({ offset: true })
    .optional()
    .describe('Only messages before this moment, ISO 8601 with time zone'),
  limit: LIMIT,
});

const OPERATION = z.strictObject({
  deviceId: COMPUTER_ID,
  operationId: z.uuid().describe('The operationId a claude_control call returned'),
});

const START = z
  .strictObject({
    deviceId: COMPUTER_ID,
    cwd: z.string().trim().min(1).describe('The working directory on that computer, an absolute path'),
    message: MESSAGE.optional().describe(
      'The first message for Claude; leave out only with continueFrom to open the chat ready for the next message',
    ),
    attachments: ATTACHMENTS,
    model: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('A model id from claude_read view models; the first available one when left out'),
    effort: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe('A thinking level the model offers, from claude_read view models'),
    title: z.string().trim().min(1).optional().describe('A short title for the chat'),
    permissionMode: CLAUDE_SETTABLE_MODE.optional().describe(
      'What Claude may do without asking: default asks for each, plan only plans, acceptEdits edits files freely',
    ),
    continueFrom: z
      .string()
      .min(1)
      .optional()
      .describe('An older Claude session id from claude_read view sessions to continue a copy of'),
    settings: CLAUDE_CLI_OPTIONS.optional(),
  })
  .refine((start) => start.message !== undefined || start.continueFrom !== undefined, {
    message: 'send a message, or continue an earlier session with continueFrom',
    path: ['message'],
  });

async function modelOf(context: ToolContext, deviceId: string, wanted?: string): Promise<string> {
  if (wanted !== undefined) return wanted;
  const models = context.store.computerRuntimes.models({ device_id: deviceId, runtime: 'claude' });
  const first = models.find((model) => model.available);
  if (first === undefined) {
    const reason = models[0]?.reason ?? 'Claude has not listed its models on this computer yet';
    throw new ToolError(`No Claude model is available on this computer: ${reason}`, 'not_ready');
  }
  return first.id;
}

async function started(context: ToolContext, request: z.output<typeof START>): Promise<Fields> {
  const deviceId = computerIdOf(context, request.deviceId);
  const { settings, permissionMode, cwd } = request;
  if (permissionMode !== undefined && settings?.permission_mode !== undefined) {
    throw new ToolError('Give the permission mode once: permissionMode or settings.permission_mode');
  }
  const model = await modelOf(context, deviceId, request.model);
  const receipt = CLAUDE_CLI_RECEIPT.parse(
    await operate(context, 'startClaudeCliSession', {
      params: { deviceId },
      body: {
        operation_id: newImageOperationId(context.actor?.callId),
        model,
        ...(request.effort === undefined ? {} : { effort: request.effort }),
        ...(request.title === undefined ? {} : { title: request.title }),
        settings: {
          ...settings,
          cwd,
          ...(permissionMode === undefined ? {} : { permission_mode: permissionMode }),
        },
        ...(request.continueFrom === undefined
          ? {}
          : { continue_from: { session_id: request.continueFrom } }),
        ...(request.message === undefined
          ? {}
          : { message: { text: request.message, attachments: request.attachments ?? [] } }),
      },
    }),
  );
  return { ...receiptLine(receipt), model };
}

const SEND = z.strictObject({ chatId: CHAT_ID, message: MESSAGE, attachments: ATTACHMENTS });

const STOP = z.strictObject({ chatId: CHAT_ID });

const CONFIGURE = z
  .strictObject({
    chatId: CHAT_ID,
    model: z.string().trim().min(1).optional().describe('The new model id from claude_read view models'),
    permissionMode: CLAUDE_SETTABLE_MODE.optional().describe(
      'The new permission mode; applies to the running reply when there is one',
    ),
  })
  .refine((input) => (input.model === undefined) !== (input.permissionMode === undefined), {
    message: 'give exactly one of model or permissionMode',
    path: ['model'],
  });

async function sent(context: ToolContext, request: z.output<typeof SEND>): Promise<Fields> {
  const message = { text: request.message, attachments: request.attachments ?? [] };
  return act(context, request.chatId, (current) => ({
    ...current,
    action: current.session_id !== null && current.job_id === null ? 'resume' : 'send',
    message,
  }));
}

async function configured(
  context: ToolContext,
  { chatId, model, permissionMode }: z.output<typeof CONFIGURE>,
): Promise<Fields> {
  return act(context, chatId, (current) =>
    model === undefined
      ? { ...current, action: 'set_permission_mode', mode: permissionMode ?? 'default' }
      : { ...current, action: 'set_model', model },
  );
}

const ANSWER = z.strictObject({
  chatId: CHAT_ID,
  promptId: z
    .string()
    .min(1)
    .optional()
    .describe('The prompt id from claude_read view cli_prompts; the only waiting prompt when left out'),
  answer: PROVIDER_ANSWER,
});

async function answered(context: ToolContext, request: z.output<typeof ANSWER>): Promise<Fields> {
  const { deviceId, session } = await sessionOf(context, request.chatId);
  const waiting = session.provider.prompts.filter((prompt) => prompt.status === 'pending');
  const prompt =
    request.promptId === undefined
      ? waiting.length === 1
        ? waiting[0]
        : undefined
      : waiting.find((candidate) => candidate.id === request.promptId);
  if (prompt === undefined) {
    const lines = waiting.map((candidate) => `${candidate.id} (${candidate.kind})`).join(', ');
    throw new ToolError(
      waiting.length === 0
        ? 'This chat waits on no prompt; claude_read view cli_prompts shows what it waits on'
        : `Say which prompt with promptId: ${lines}`,
    );
  }
  await operate(context, 'answerClaudeCliPrompt', {
    params: { deviceId, chatId: request.chatId, promptId: prompt.id },
    body: {
      session_id: session.provider.session_id,
      job_id: session.provider.job_id ?? failed('This chat has no running reply to answer for'),
      answer: request.answer,
    },
  });
  return { ok: true, summary: `Answered prompt ${prompt.id}`, chatId: request.chatId };
}

function failed(message: string): never {
  throw new ToolError(message, 'conflict');
}

function stopped(session: ClaudeCliSession): void {
  if (!running(session)) {
    throw new ToolError('This chat has no running reply to stop; claude_read view cli_session shows its state');
  }
}

function closing(session: ClaudeCliSession): void {
  if (session.provider.job_id === null) {
    throw new ToolError('This chat has no running Claude process to close');
  }
}

export const CLAUDE_TOOLS: readonly Tool[] = [
  reads('list_claude_cli_sessions', LIST, listed),
  reads('read_claude_cli_session', SESSION, async (context, { chatId }) => ({
    ...sessionLine((await sessionOf(context, chatId)).session),
  })),
  reads('read_claude_cli_history', HISTORY, async (context, { chatId, before, limit }) => ({
    messages: await operate(context, 'readClaudeCliHistory', {
      params: { deviceId: chatComputer(context, chatId), chatId },
      query: {
        ...(before === undefined ? {} : { before }),
        ...(limit === undefined ? {} : { limit: String(limit) }),
      },
    }),
  })),
  reads('read_claude_cli_operation', OPERATION, async (context, { deviceId, operationId }) =>
    receiptLine(
      CLAUDE_CLI_RECEIPT.parse(
        await operate(context, 'readClaudeCliOperation', {
          params: { deviceId: computerIdOf(context, deviceId), operationId },
        }),
      ),
    ),
  ),
  reads('list_claude_cli_prompts', SESSION, async (context, { chatId }) => ({
    prompts: (await sessionOf(context, chatId)).session.provider.prompts,
  })),
  reads('list_claude_models', DEVICE, async (context, { deviceId }) => {
    const id = computerIdOf(context, deviceId);
    const models = context.store.computerRuntimes.models({ device_id: id, runtime: 'claude' });
    return {
      count: models.length,
      models: models.map((model) => ({
        modelId: model.id,
        name: model.name,
        efforts: model.efforts,
        available: model.available,
        ...(model.reason === null ? {} : { reason: model.reason }),
      })),
    };
  }),
  writes('start_claude_session', START, started),
  writes('send_claude_message', SEND, sent),
  writes('stop_claude_session', STOP, (context, { chatId }) =>
    act(context, chatId, (current) => ({ ...current, action: 'stop' }), stopped),
  ),
  writes(
    'close_claude_session',
    STOP,
    (context, { chatId }) =>
      act(context, chatId, (current) => ({ ...current, action: 'close' }), closing),
    true,
  ),
  writes('configure_claude_session', CONFIGURE, configured),
  writes('answer_claude_prompt', ANSWER, answered, true),
];
