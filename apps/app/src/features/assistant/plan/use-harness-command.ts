import { useRef, useState } from 'react';
import { randomUUID } from 'expo-crypto';
import type { AiChatRow, AiHarnessCommandScope, AiHarnessSession } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { notify } from '../../../components/toast-store';
import {
  captureAssistantWrite,
  type AssistantWriteScope,
} from '../../../store/assistant-response-style';
import { useEntityStore } from '../../../store/store-context';
import { useDshCommandBinding } from '../commands/dsh-binding';
import { executeCommand } from '../commands/execute';

export interface HarnessCommand {
  readonly reason: string | null;
  readonly plan: AiHarnessSession['plan'];
  readonly running: string | null;
  readonly run: (line: string) => void;
}

function sendCommand(
  chatId: string,
  bindingKey: string,
  body: AiHarnessCommandScope & { readonly line: string },
  authority: AssistantWriteScope,
): Promise<void> {
  return executeCommand(
    chatId,
    bindingKey,
    { ...body, operation_id: randomUUID(), attachments: [] },
    authority,
  )
    .then((outcome) => {
      const text =
        outcome.status === 'settled' ? (outcome.execution.result.text ?? 'Done.') : outcome.message;
      notify({ message: text, tone: outcome.status === 'settled' ? 'default' : 'critical' });
    })
    .catch((error: unknown) => {
      notify({ message: 'Couldn’t confirm the change.', error, tone: 'critical' });
    });
}

export function useHarnessCommand(chat: AiChatRow | undefined): HarnessCommand {
  const [running, setRunning] = useState<string | null>(null);
  const active = useRef(false);
  const binding = useDshCommandBinding(chat, false);
  const store = useEntityStore();
  const { scope, problem, reason } = binding;
  const prepare =
    chat?.engine.kind === 'dsh' && chat.engine.session_id === null && problem === 'preparing';
  return {
    reason: scope !== null || prepare ? null : reason,
    plan: binding.session?.plan,
    running,
    run: (line): void => {
      if (chat === undefined || active.current || (scope === null && !prepare)) return;
      const authority = captureAssistantWrite(store);
      active.current = true;
      setRunning(line);
      const target = scope === null ? binding.prepare() : Promise.resolve(binding);
      background(
        target
          .then(({ key, scope: ready, reason: blocked }) => {
            if (ready === null) {
              notify({ message: blocked ?? 'Couldn’t load commands.', tone: 'critical' });
              return;
            }
            return sendCommand(chat.id, key, { ...ready, line }, authority);
          })
          .finally(() => {
            active.current = false;
            setRunning(null);
          }),
        'plan.command_failed',
      );
    },
  };
}
