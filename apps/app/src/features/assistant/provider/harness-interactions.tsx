import { Logger, background } from '@smarteverything/logging';
import { randomUUID } from 'expo-crypto';
import { useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { harnessTargetKey } from '@smarteverything/domain';
import type {
  AiChatRow,
  AiHarnessInteraction,
  AiHarnessSession,
  JsonValue,
} from '@smarteverything/domain';
import { selectProfile } from '../../../api/people';
import { DecisionStatus } from '../../../components/decision-frame';
import { ProfileGate } from '../../../components/profile-gate';
import { notify } from '../../../components/toast-store';
import { Text } from '../../../components/text';
import { useActiveProfile } from '../../../store/people';
import { useDevice, useRow, useSyncStatus } from '../../../store/selectors';
import { NeedsYouDock, type NeedsRequest } from '../approvals/needs-you-dock';
import { requestCopy, type RequestKind } from '../approvals/needs-you-model';
import { PermissionRequest } from '../approvals/permission-request';
import { sendInstruction } from '../approvals/tell-instead';
import { useRefetchOnLive } from '../approvals/use-refetch-on-live';
import { useChatHarness, useHarnessAnswer } from '../data/harness';
import { HARNESS_PERMISSION_REQUEST, HARNESS_QUESTION_REQUEST } from '../model/harness-questions';
import { HarnessQuestions } from './harness-questions';

const log = new Logger('app.harness');

const CANNOT_ANSWER =
  'This request can’t be answered here. Answer it on the machine or stop the reply.';

function useSubmit(
  chatId: string,
  interaction: AiHarnessInteraction,
): {
  readonly answer: ReturnType<typeof useHarnessAnswer>;
  readonly submit: (value: JsonValue, then?: () => void) => void;
} {
  const answer = useHarnessAnswer(chatId);
  const attempt = useRef<{ readonly payload: string; readonly id: string } | null>(null);
  const submit = (value: JsonValue, then?: () => void): void => {
    const payload = JSON.stringify(value);
    const retry = attempt.current?.payload === payload;
    const current =
      retry && attempt.current !== null ? attempt.current : { payload, id: randomUUID() };
    attempt.current = current;
    log.info('interaction.answer_submitted', {
      chatId,
      interactionId: interaction.id,
      kind: interaction.kind,
      epoch: interaction.epoch,
      retry,
    });
    answer.mutate(
      {
        operation_id: current.id,
        interaction_id: interaction.id,
        expected_epoch: interaction.epoch,
        answer: value,
      },
      then === undefined ? undefined : { onSuccess: then },
    );
  };
  return { answer, submit };
}

function Request({
  chatId,
  interaction,
  frozen,
  submit,
}: {
  readonly chatId: string;
  readonly interaction: AiHarnessInteraction;
  readonly frozen: boolean;
  readonly submit: (value: JsonValue, then?: () => void) => void;
}): ReactNode {
  const permission = HARNESS_PERMISSION_REQUEST.safeParse(interaction.request);
  const questions = HARNESS_QUESTION_REQUEST.safeParse(interaction.request);
  if (interaction.kind === 'permission' && permission.success)
    return (
      <PermissionRequest
        tool={permission.data.tool_name}
        reason={permission.data.reason}
        pending={frozen}
        handlers={{
          allow: () => {
            submit('allowed-once');
          },
          deny: () => {
            submit('rejected');
          },
          cancel: () => {
            submit('cancelled');
          },
          tell: (text) => {
            submit('rejected', () => {
              background(sendInstruction(chatId, text), 'instruction.send_failed');
            });
          },
        }}
      />
    );
  if (interaction.kind === 'question' && questions.success)
    return (
      <HarnessQuestions questions={questions.data.questions} pending={frozen} submit={submit} />
    );
  return <Text tone="warning">{CANNOT_ANSWER}</Text>;
}

export function HarnessInteraction({
  chatId,
  interaction,
  disabled = false,
  titled = true,
}: {
  readonly chatId: string;
  readonly interaction: AiHarnessInteraction;
  readonly disabled?: boolean;
  readonly titled?: boolean;
}): ReactNode {
  const { answer, submit } = useSubmit(chatId, interaction);
  const frozen = disabled || answer.isPending || answer.isSuccess;
  return (
    <View className="gap-3">
      {titled && interaction.kind === 'permission' ? (
        <Text variant="title-3" accessibilityRole="header">
          Allow {toolOf(interaction)}?
        </Text>
      ) : null}
      <Request chatId={chatId} interaction={interaction} frozen={frozen} submit={submit} />
      <DecisionStatus pending={answer.isPending} received={answer.isSuccess} error={answer.error} />
    </View>
  );
}

function kindOf(interaction: AiHarnessInteraction): RequestKind {
  if (interaction.kind === 'permission') return 'permission';
  return interaction.kind === 'question' ? 'question' : 'other';
}

function toolOf(interaction: AiHarnessInteraction): string {
  const parsed = HARNESS_PERMISSION_REQUEST.safeParse(interaction.request);
  return parsed.success ? parsed.data.tool_name : 'a tool';
}

function needsRequest(
  chatId: string,
  state: AiHarnessSession,
  interaction: AiHarnessInteraction,
  options: { readonly machine: string; readonly frozen: boolean },
): NeedsRequest {
  const copy = requestCopy(kindOf(interaction), options.machine, toolOf(interaction));
  return {
    id: `${interaction.id}:${String(interaction.epoch)}`,
    title: copy.title,
    needs: copy.needs,
    stale: interaction.epoch !== state.epoch,
    content: (
      <HarnessInteraction
        chatId={chatId}
        interaction={interaction}
        disabled={options.frozen}
        titled={false}
      />
    ),
  };
}

function useHarnessGate(chat: AiChatRow): ReactNode | null {
  const active = useActiveProfile();
  const owner = useRow('profiles', chat.profile_id);
  if (active === null || owner === null || active.id === chat.profile_id) return null;
  return (
    <ProfileGate
      profileName={owner.name}
      onSwitch={() => {
        selectProfile(chat.profile_id).catch((error: unknown) => {
          notify({ message: 'The profile was not changed', error, tone: 'critical' });
        });
      }}
    />
  );
}

interface DockView {
  readonly machine: string;
  readonly notice: string | null;
  readonly gate: ReactNode | null;
  readonly requests: readonly NeedsRequest[];
}

function useMachine(target: AiHarnessSession['target'] | undefined): string {
  const device = useDevice(target?.kind === 'device' ? target.device_id : '');
  return target?.kind === 'server' ? 'Home Hub' : (device?.label ?? 'The computer');
}

function useHarnessRequests(chat: AiChatRow, dismissed: ReadonlySet<string>): DockView {
  const live = useSyncStatus().status === 'live';
  const state = useChatHarness(
    chat.id,
    chat.engine.kind === 'dsh' && chat.engine.session_id !== null,
  );
  useRefetchOnLive(live, () => {
    background(state.refetch(), 'state.refetch_failed');
  });
  const session = state.data;
  const machine = useMachine(session?.target);
  const gate = useHarnessGate(chat);
  if (session === undefined || harnessRebinding(chat, session))
    return { machine, notice: null, gate, requests: [] };
  const notice = harnessNotice(live, session, machine);
  const frozen = notice !== null;
  const requests = session.interactions
    .map((interaction) => needsRequest(chat.id, session, interaction, { machine, frozen }))
    .filter((request) => !dismissed.has(request.id));
  return { machine, notice, gate, requests };
}

export function HarnessPromptDock({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const { machine, notice, gate, requests } = useHarnessRequests(chat, dismissed);
  return (
    <NeedsYouDock
      requests={requests}
      machine={machine}
      gate={gate}
      notice={notice}
      onDismiss={(id) => {
        setDismissed((previous) => new Set([...previous, id]));
      }}
    />
  );
}

function harnessNotice(live: boolean, session: AiHarnessSession, machine: string): string | null {
  if (!live) return 'Reconnect to answer this request.';
  return ['unavailable', 'failed', 'switching'].includes(session.state)
    ? `${machine} can’t take answers right now.`
    : null;
}

function harnessRebinding(chat: AiChatRow, session: AiHarnessSession): boolean {
  return (
    chat.engine.kind === 'dsh' &&
    (session.session_id !== chat.engine.session_id ||
      harnessTargetKey(session.target) !== harnessTargetKey(chat.engine.execution_target) ||
      session.metadata.profile_id !== chat.profile_id)
  );
}
