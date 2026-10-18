import { effectiveTools } from '../../coordination/grants';
import { PROVIDER_TURN, type ProviderTurn } from '@smarteverything/domain';
import { managedProviderProject, managedProviderInstructions } from '../computer/project-access';
import { facts } from '../../prompt-facts';
import { scopedHub } from '../../coordination/scoped-tools';
import { stablePrompt, turnPrompt } from '../../conversation/prompt';
import { providerMessages } from '../computer/content';
import type { ComputerRunnerDeps, Turn } from '../computer/runner';

export async function providerInput(
  deps: ComputerRunnerDeps,
  turn: Turn,
  sessionId: string | null,
): Promise<ProviderTurn> {
  const { chat, event, grant } = turn;
  if (chat.engine.kind !== 'claude') throw new Error('Expected Claude input binding.');
  const settings = deps.directory.status(chat.engine.device_id).settings.provider.options;
  const options = { ...settings, ...chat.engine.settings };
  const project = managedProviderProject(deps, chat, sessionId, options.cwd);
  const context = facts(
    deps.store,
    chat,
    scopedHub(deps.tools(), effectiveTools(deps.store, chat)),
    { now: deps.now(), clientId: event.client_id },
  );
  const messages = await providerMessages(
    { store: deps.store, files: deps.files },
    chat,
    event,
    sessionId !== null,
  );
  if (!event.text.startsWith('/'))
    messages.at(-1)?.content.push({ type: 'text', text: turnPrompt(context) });
  return PROVIDER_TURN.parse({
    job_id: turn.jobId,
    device_id: chat.engine.device_id,
    chat_id: chat.id,
    profile_id: chat.profile_id,
    model: chat.engine.model,
    effort: chat.engine.effort,
    session_id: sessionId,
    system: managedProviderInstructions(stablePrompt(context), project),
    messages,
    tools: grant.tools,
    options,
    ...(project === undefined ? {} : { managed_project: project }),
  });
}
