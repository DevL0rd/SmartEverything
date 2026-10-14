import { randomUUID } from 'node:crypto';
import {
  ApiError,
  PROVIDER_TURN,
  type AiChatRow,
  type ProviderEvent,
  type ClaudeProviderOptions,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { SideRequest } from '../../side-completion';
import type { ComputerRunnerDeps } from '../computer/runner';

const TIMEOUT_MS = 30_000;

export async function providerAuxiliary(
  deps: ComputerRunnerDeps,
  request: SideRequest,
): Promise<string> {
  const chat = deps.store.aiChats.chat(request.chatId);
  if (chat.engine.kind !== 'claude')
    throw new ApiError('conflict', 'This auxiliary request belongs to a different engine.');
  const jobId = randomUUID();
  const turn = auxiliaryTurn(
    chat,
    request,
    jobId,
    deps.directory.status(chat.engine.device_id).settings.provider.options,
  );
  const result = new AuxiliaryResult();
  const leave = deps.directory.onEvent(({ deviceId, event }) => {
    if (deviceId !== turn.device_id || event.kind !== 'provider' || event.event.job_id !== jobId)
      return;
    if (event.event.kind === 'accepted')
      deps.store.aiProvider.associate(chat.id, turn.device_id, event.event.session_id);
    result.feed(event.event);
  });
  const timer = setTimeout(() => {
    result.fail('The supplying computer did not finish auxiliary work within the deadline.');
  }, TIMEOUT_MS);
  try {
    const [, text] = await Promise.all([deps.directory.startTurn(turn), result.done]);
    return text;
  } finally {
    clearTimeout(timer);
    leave();
    if (deps.directory.status(turn.device_id).online)
      await deps.directory
        .request(
          turn.device_id,
          { operation: 'provider_control', job_id: jobId, control: { action: 'close' } },
          z.unknown(),
        )
        .catch((cause: unknown) => {
          deps.log.error('claude.auxiliary_close_failed', cause, { chatId: chat.id });
        });
  }
}

function auxiliaryTurn(
  chat: AiChatRow,
  request: SideRequest,
  jobId: string,
  options: ClaudeProviderOptions,
): ReturnType<typeof PROVIDER_TURN.parse> {
  if (chat.engine.kind !== 'claude')
    throw new ApiError('conflict', 'The auxiliary engine binding changed.');
  const system = request.messages
    .filter((message) => message.role === 'system')
    .map((message) => contentOf(message.content))
    .join('\n');
  const text = request.messages
    .filter((message) => message.role !== 'system')
    .map((message) => contentOf(message.content))
    .join('\n');
  return PROVIDER_TURN.parse({
    job_id: jobId,
    chat_id: chat.id,
    profile_id: chat.profile_id,
    device_id: chat.engine.device_id,
    model: chat.engine.model,
    effort: null,
    session_id: null,
    system,
    messages: [{ role: 'user', content: [{ type: 'text', text }] }],
    tools: [],
    options: {
      ...options,
      ...chat.engine.settings,
      agent: undefined,
      output_format: undefined,
      resume_session_at: undefined,
      flag_settings: undefined,
      builtin_tools: ['AskUserQuestion'],
      agents: {},
      mcp_servers: {},
      plugins: [],
      permission_mode: 'plan',
      max_turns: 1,
      fork_session: false,
    },
  });
}

function contentOf(content: SideRequest['messages'][number]['content']): string {
  if (typeof content === 'string') return content;
  throw new ApiError(
    'invalid_request',
    'Auxiliary title and suggestion work requires text-only input.',
  );
}

class AuxiliaryResult {
  private text = '';
  private resolve: (text: string) => void = () => {
    return;
  };
  private reject: (cause: Error) => void = () => {
    return;
  };
  readonly done = new Promise<string>((resolve, reject) => {
    this.resolve = resolve;
    this.reject = reject;
  });
  feed(event: ProviderEvent): void {
    if (event.kind === 'text') this.text += event.delta;
    if (event.kind === 'completed') {
      if (event.interrupted) this.fail('Auxiliary provider work was interrupted.');
      else this.resolve(this.text);
    }
    if (event.kind === 'failed') this.fail(event.message);
    if (event.kind === 'prompt' || event.kind === 'dialog')
      this.fail('Auxiliary work requested an interactive prompt; no answer was inferred.');
  }
  fail(reason: string): void {
    this.reject(new ApiError('claude_not_ready', reason));
  }
}
