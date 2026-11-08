import { randomUUID } from 'node:crypto';
import {
  CODEX_PROVIDER_TURN,
  PROVIDER_TURN,
  ApiError,
  type AiChatRow,
  type ComputerRuntimeProviderTurn,
  type ProviderTurn,
} from '@smarteverything/domain';
import { assertProviderTurnSize } from '../../../computers/provider-turn-size';
import { computerEngine, type ComputerEngine } from '../../engine-kind';
import type { HelperProviderInput } from '../engine';
import { managedProviderProject } from './project-access';
import { appendsProviderContext, helperProviderMessage, providerMessages } from './content';
import { providerPrompt } from './prompt';
import { effectiveProviderEngine } from './options';
import { grantOf } from './turn';
import type { ComputerRunnerDeps, Turn } from './ports';

interface InputBinding {
  readonly jobId: string;
  readonly chat: AiChatRow & { readonly engine: ComputerEngine };
  readonly event: Pick<Turn['event'], 'client_id' | 'text'>;
  readonly grant: Turn['grant'];
  readonly sessionId: string | null;
}

interface InputFrame {
  readonly engine: ComputerEngine;
  readonly context: string;
  readonly text: string;
  readonly envelope: Omit<ProviderTurn, 'options' | 'messages'>;
}

export async function providerInput(
  deps: ComputerRunnerDeps,
  turn: Turn,
  sessionId: string | null,
): Promise<{ readonly input: ComputerRuntimeProviderTurn; readonly engine: ComputerEngine }> {
  const { chat, event } = turn;
  const frame = frameOf(deps, { ...turn, sessionId });
  const messages = await providerMessages(
    { store: deps.store, files: deps.files, runtime: chat.engine.kind },
    chat,
    event,
    sessionId !== null,
  );
  return { input: assembleInput(frame, messages), engine: frame.engine };
}

export async function preflightProviderInput(
  deps: ComputerRunnerDeps,
  input: HelperProviderInput,
  sessionId: string | null,
): Promise<void> {
  const engine = computerEngine(input.target.engine);
  if (engine === null) throw new ApiError('conflict', 'The helper’s provider binding changed.');
  const chat = { ...input.target, engine };
  const frame = frameOf(deps, {
    jobId: randomUUID(),
    chat,
    event: { client_id: input.clientId, text: input.text },
    grant: grantOf(deps, chat),
    sessionId,
  });
  const message = await helperProviderMessage(deps, input, engine);
  assertProviderTurnSize(assembleInput(frame, [message]).turn);
}

function frameOf(deps: ComputerRunnerDeps, input: InputBinding): InputFrame {
  const { chat, event, sessionId } = input;
  const settings = deps.directory.runtimeStatus({
    device_id: chat.engine.device_id,
    runtime: chat.engine.kind,
  }).settings;
  const engine = effectiveProviderEngine(chat.engine, settings);
  const project = managedProviderProject(deps, chat, sessionId, engine.settings.cwd);
  const prompt = providerPrompt(deps, input, project);
  return {
    engine,
    context: prompt.context,
    text: event.text,
    envelope: {
      job_id: input.jobId,
      device_id: engine.device_id,
      chat_id: chat.id,
      profile_id: chat.profile_id,
      model: engine.model,
      effort: engine.effort,
      session_id: sessionId,
      system: prompt.system,
      tools: input.grant.tools,
      ...(project === undefined ? {} : { managed_project: project }),
    },
  };
}

function assembleInput(
  frame: InputFrame,
  messages: ProviderTurn['messages'],
): ComputerRuntimeProviderTurn {
  if (appendsProviderContext(frame.engine.kind, frame.text))
    messages.at(-1)?.content.push({ type: 'text', text: frame.context });
  const envelope = { ...frame.envelope, options: frame.engine.settings, messages };
  if (frame.engine.kind === 'claude')
    return { runtime: 'claude', turn: PROVIDER_TURN.parse(envelope) };
  validateCodexMessages(messages);
  return { runtime: 'codex', turn: CODEX_PROVIDER_TURN.parse(envelope) };
}

function validateCodexMessages(messages: ProviderTurn['messages']): void {
  if (messages.some((message) => message.content.some((part) => part.type === 'document')))
    throw new ApiError(
      'invalid_request',
      'Codex accepts text and supported images; convert PDF input explicitly.',
    );
}
