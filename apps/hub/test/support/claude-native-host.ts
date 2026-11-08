import {
  type ComputerAiCapabilities,
  type ComputerAiExecute,
  type ComputerAiReply,
  type ProviderEvent,
  type ProviderTurn,
} from '@smarteverything/domain';
import { vi } from 'vitest';
import type { ComputerAiHostEvent } from '../../src/computers/ai-host';
import type { ComputerAiDirectory } from '../../src/computers/ai-directory';

export const CLAUDE_NATIVE_SESSION = 'session-from-claude-computer';
export const CLAUDE_NATIVE_PROMPT = 'pending-claude-permission';

const CAPABILITIES: ComputerAiCapabilities = {
  runtime_version: '1.0.0',
  operations: ['provider_start', 'provider_answer'],
  settings: [],
  control_reason: null,
  provider_reason: null,
};

function permission(turn: ProviderTurn): ProviderEvent {
  return {
    job_id: turn.job_id,
    chat_id: turn.chat_id,
    seq: 2,
    kind: 'prompt',
    prompt: {
      id: CLAUDE_NATIVE_PROMPT,
      session_id: CLAUDE_NATIVE_SESSION,
      kind: 'permission',
      tool_name: 'Bash',
      input: { command: 'pwd' },
      questions: [],
      risk: 'safe',
      risk_reasons: [],
      state: 'waiting',
      answered_by: null,
      created_at: '2026-11-05T00:00:00.000Z',
      expires_at: '2026-11-05T00:01:00.000Z',
    },
  };
}

function reply(
  input: ComputerAiExecute,
  send: (event: ProviderEvent) => void,
): Promise<ComputerAiReply> {
  if (input.operation === 'provider_answer') {
    return Promise.resolve({ operation: 'provider_answer', value: { answered: true } });
  }
  if (input.operation !== 'provider_start') throw new Error('Unexpected Claude operation.');
  const { turn } = input;
  const { job_id, chat_id } = turn;
  send({ kind: 'accepted', job_id, chat_id, seq: 1, session_id: CLAUDE_NATIVE_SESSION });
  if (turn.session_id === null) send(permission(turn));
  return Promise.resolve({
    operation: 'provider_start',
    value: { job_id, session_id: CLAUDE_NATIVE_SESSION },
  });
}

export function attachClaudeNativeHost(
  directory: ComputerAiDirectory,
  deviceId: string,
): {
  readonly execute: ReturnType<
    typeof vi.fn<(input: ComputerAiExecute) => Promise<ComputerAiReply>>
  >;
  readonly finish: (turn: ProviderTurn, text: string) => void;
} {
  const listeners = new Set<(event: ComputerAiHostEvent) => void>();
  const send = (event: ProviderEvent): void => {
    for (const listener of listeners) listener({ kind: 'provider', event });
  };
  const execute = vi.fn((input: ComputerAiExecute): Promise<ComputerAiReply> => reply(input, send));
  directory.attach(
    deviceId,
    {
      execute,
      read: (): Promise<never> => Promise.reject(new Error('Unexpected Claude read.')),
      onEvent: (listener) => {
        listeners.add(listener);
        listener({ kind: 'capabilities', capabilities: CAPABILITIES });
        return (): void => {
          listeners.delete(listener);
        };
      },
      stop: (): void => undefined,
    },
    false,
  );

  return {
    execute,
    finish: (turn, text): void => {
      const base = { job_id: turn.job_id, chat_id: turn.chat_id };
      send({ ...base, seq: 3, kind: 'text', delta: text });
      send({
        ...base,
        seq: 4,
        kind: 'completed',
        session_id: CLAUDE_NATIVE_SESSION,
        interrupted: false,
      });
    },
  };
}
