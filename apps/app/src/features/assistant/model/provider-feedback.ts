import { harnessTargetKey } from '@smarteverything/domain';
import type {
  AiChatRow,
  AiHarnessSession,
  AiChatProvider,
  AiChatRuntimeProvider,
} from '@smarteverything/domain';
import {
  ANSWER_LABEL,
  APPROVAL_LABEL,
  RECONNECTING_LABEL,
  SWITCHING_LABEL,
  type TurnFeedback,
} from './turn-feedback';

type NativeProvider = AiChatProvider | AiChatRuntimeProvider;

export function harnessFeedback(
  chat: AiChatRow,
  session: AiHarnessSession | undefined,
): TurnFeedback | null {
  if (session === undefined || !harnessBound(chat, session)) return null;
  if (reconnecting(session)) return { label: RECONNECTING_LABEL, moving: true };
  if (session.interactions.some((interaction) => interaction.kind === 'permission'))
    return { label: APPROVAL_LABEL, moving: false };
  if (session.interactions.length > 0) return { label: ANSWER_LABEL, moving: false };
  if (session.state === 'waiting') return { label: 'Waiting for the machine…', moving: false };
  if (session.state === 'switching') return { label: SWITCHING_LABEL, moving: true };
  return null;
}

const NATIVE_FEEDBACK: Readonly<Record<NativeProvider['state'], TurnFeedback | null>> = {
  starting: { label: 'Starting…', moving: true },
  waiting_answer: { label: ANSWER_LABEL, moving: false },
  waiting_approval: { label: APPROVAL_LABEL, moving: false },
  stopping: { label: 'Stopping…', moving: true },
  unknown: { label: 'Waiting for provider status', moving: false },
  idle: null,
  working: null,
  failed: null,
  completed: null,
  interrupted: null,
};

function promptFeedback(provider: NativeProvider): TurnFeedback | null {
  const prompt = provider.prompts.find((item) => item.status === 'pending');
  if (prompt === undefined) return NATIVE_FEEDBACK[provider.state];
  const question = ['user_input', 'question', 'elicitation', 'mcp_form', 'mcp_url'].includes(
    prompt.kind,
  );
  return { label: question ? ANSWER_LABEL : APPROVAL_LABEL, moving: false };
}

export function nativeFeedback(
  chat: AiChatRow,
  provider: NativeProvider | undefined,
): TurnFeedback | null {
  if (provider === undefined) return null;
  if (chat.engine.kind !== 'claude' && chat.engine.kind !== 'codex') return null;
  if (provider.device_id !== chat.engine.device_id) return null;
  if ('runtime' in provider && provider.runtime !== chat.engine.kind) return null;
  return promptFeedback(provider);
}

function reconnecting(session: AiHarnessSession): boolean {
  return session.reconnecting === true;
}

function harnessBound(chat: AiChatRow, session: AiHarnessSession): boolean {
  return (
    chat.engine.kind === 'dsh' &&
    session.session_id === chat.engine.session_id &&
    session.metadata.profile_id === chat.profile_id &&
    harnessTargetKey(session.target) === harnessTargetKey(chat.engine.execution_target)
  );
}
