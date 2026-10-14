import { effectiveTools } from '../../coordination/grants';
import {
  CODEX_PROVIDER_TURN,
  ApiError,
  type ComputerRuntimeProviderTurn,
} from '@smarteverything/domain';
import { providerInput as claudeInput } from '../claude/input';
import { managedProviderProject } from './project-access';
import { providerMessages } from './content';
import { facts } from '../../prompt-facts';
import { scopedHub } from '../../coordination/scoped-tools';
import { stablePrompt, turnPrompt } from '../../conversation/prompt';
import type { ComputerRunnerDeps, Turn } from './runner';
export async function providerInput(
  deps: ComputerRunnerDeps,
  turn: Turn,
  sessionId: string | null,
): Promise<ComputerRuntimeProviderTurn> {
  if (turn.chat.engine.kind === 'claude')
    return { runtime: 'claude', turn: await claudeInput(deps, turn, sessionId) };
  const { chat, event } = turn;
  const settings = deps.directory.runtimeStatus({
    device_id: chat.engine.device_id,
    runtime: 'codex',
  }).settings;
  if (settings.runtime !== 'codex')
    throw new ApiError('conflict', 'Expected Codex runtime settings.');
  const options = { ...settings.settings.provider.options, ...chat.engine.settings };
  const project = managedProviderProject(deps, chat, sessionId, options.cwd);
  const context = facts(
    deps.store,
    chat,
    scopedHub(deps.tools(), effectiveTools(deps.store, chat)),
    deps.now(),
  );
  const messages = await providerMessages(
    { ...deps, runtime: 'codex' },
    chat,
    event,
    sessionId !== null,
  );
  validateCodexMessages(messages);
  messages.at(-1)?.content.push({ type: 'text', text: turnPrompt(context) });
  return {
    runtime: 'codex',
    turn: CODEX_PROVIDER_TURN.parse({
      job_id: turn.jobId,
      device_id: chat.engine.device_id,
      chat_id: chat.id,
      profile_id: chat.profile_id,
      model: chat.engine.model,
      effort: chat.engine.effort,
      session_id: sessionId,
      system: stablePrompt(context),
      messages,
      tools: turn.grant.tools,
      options,
      ...(project === undefined ? {} : { managed_project: project }),
    }),
  };
}

function validateCodexMessages(messages: Awaited<ReturnType<typeof providerMessages>>): void {
  if (messages.some((message) => message.content.some((part) => part.type === 'document')))
    throw new ApiError(
      'invalid_request',
      'Codex accepts text and supported images; convert PDF input explicitly.',
    );
}
