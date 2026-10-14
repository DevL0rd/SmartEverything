import { CHAT_ERROR_MESSAGE } from '../model/turn-notice';
import { randomUUID } from 'expo-crypto';
import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { harnessTargetKey } from '@smarteverything/domain';
import type {
  AiChatRow,
  AiHarnessInteraction,
  AiHarnessSession,
  JsonValue,
} from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { DecisionApproval } from '../../../components/decision-approval';
import { DecisionFrame, DecisionStatus } from '../../../components/decision-frame';
import { Text } from '../../../components/text';
import { useActiveProfile } from '../../../store/people';
import { useDevice, useSyncStatus } from '../../../store/selectors';
import { useChatHarness, useHarnessAnswer } from '../data/harness';
import { HARNESS_PERMISSION_REQUEST, HARNESS_QUESTION_REQUEST } from '../model/harness-questions';
import { HarnessQuestions } from './harness-questions';
function Permission({
  request,
  disabled,
  submit,
}: {
  readonly request: AiHarnessInteraction['request'];
  readonly disabled: boolean;
  readonly submit: (answer: JsonValue) => void;
}): ReactNode {
  const parsed = HARNESS_PERMISSION_REQUEST.safeParse(request);
  if (!parsed.success)
    return (
      <Text tone="warning">
        Unsupported permission request. Review on the execution host or stop the turn.
      </Text>
    );
  return (
    <View className="gap-3">
      <Text variant="title-3" accessibilityRole="header">
        Allow {parsed.data.tool_name}?
      </Text>
      {parsed.data.reason === undefined ? null : <Text selectable>{parsed.data.reason}</Text>}
      <Text variant="footnote" tone="variant">
        Full action details were not supplied by the execution host.
      </Text>
      <DecisionApproval
        pending={disabled}
        options={[
          { id: 'rejected', label: 'Deny', effect: 'deny' },
          { id: 'allowed-once', label: 'Allow once', effect: 'allow' },
          { id: 'cancelled', label: 'Cancel request', effect: 'cancel' },
        ]}
        answer={submit}
      />
    </View>
  );
}
export function HarnessInteraction({
  chatId,
  interaction,
  disabled = false,
}: {
  readonly chatId: string;
  readonly interaction: AiHarnessInteraction;
  readonly disabled?: boolean;
}): ReactNode {
  const answer = useHarnessAnswer(chatId);
  const attempt = useRef<{ readonly payload: string; readonly id: string } | null>(null);
  const frozen = disabled || answer.isPending || answer.isSuccess;
  const submit = (value: JsonValue): void => {
    const payload = JSON.stringify(value);
    if (attempt.current?.payload !== payload) attempt.current = { payload, id: randomUUID() };
    answer.mutate({
      operation_id: attempt.current.id,
      interaction_id: interaction.id,
      expected_epoch: interaction.epoch,
      answer: value,
    });
  };
  const questions = HARNESS_QUESTION_REQUEST.safeParse(interaction.request);
  return (
    <View className="gap-3">
      {interaction.kind === 'permission' ? (
        <Permission request={interaction.request} disabled={frozen} submit={submit} />
      ) : interaction.kind === 'question' && questions.success ? (
        <HarnessQuestions questions={questions.data.questions} pending={frozen} submit={submit} />
      ) : (
        <Text tone="warning">
          This request is unsupported. Review on the execution host or stop the turn.
        </Text>
      )}
      <DecisionStatus pending={answer.isPending} received={answer.isSuccess} error={answer.error} />
    </View>
  );
}
export function HarnessPromptDock({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const profile = useActiveProfile();
  const sync = useSyncStatus();
  const state = useChatHarness(
    chat.id,
    chat.engine.kind === 'dsh' && chat.engine.session_id !== null,
  );
  const target = state.data?.target;
  const device = useDevice(target?.kind === 'device' ? target.device_id : '');
  const pending = state.data?.interactions ?? [];
  const unavailable =
    harnessUnavailable(sync.status === 'live', state.error, state.data) ??
    harnessBinding(chat, state.data);
  return (
    <DecisionFrame
      source={harnessSource(target?.kind === 'server', device?.label)}
      unavailable={unavailable}
      retry={() => {
        void state.refetch();
      }}
      requests={pending.map((interaction) =>
        harnessRequest({
          chatId: chat.id,
          profileId: profile?.id ?? null,
          state: state.data,
          interaction,
          unavailable,
          refresh: () => {
            void state.refetch();
          },
        }),
      )}
    />
  );
}

function harnessUnavailable(
  live: boolean,
  error: Error | null,
  state: AiHarnessSession | undefined,
): string | null {
  if (!live) return 'Reconnect to answer this request.';
  if (error !== null) return CHAT_ERROR_MESSAGE;
  if (state === undefined) return null;
  return ['unavailable', 'failed', 'switching'].includes(state.state)
    ? 'The execution host cannot accept answers right now.'
    : null;
}
function harnessRequest({
  chatId,
  profileId,
  state,
  interaction,
  unavailable,
  refresh,
}: {
  readonly refresh: () => void;
  readonly chatId: string;
  readonly profileId: string | null;
  readonly state: AiHarnessSession | undefined;
  readonly interaction: AiHarnessInteraction;
  readonly unavailable: string | null;
}): { readonly id: string; readonly content: ReactNode } {
  if (state === undefined) throw new Error('Pending interaction requires its native session.');
  const admission = harnessAdmission(profileId, state, interaction);
  return {
    id: `${profileId ?? 'none'}:${chatId}:${state.session_id}:${JSON.stringify(state.target)}:${interaction.id}:${String(interaction.epoch)}:${JSON.stringify(interaction.request)}`,
    content: (
      <View className="gap-3">
        {admission === null ? null : (
          <View className="gap-2">
            <Text tone="warning">{admission}</Text>
            <Button label="Refresh requests" size="lg" variant="text" onPress={refresh} />
          </View>
        )}
        <HarnessInteraction
          chatId={chatId}
          interaction={interaction}
          disabled={unavailable !== null || admission !== null}
        />
      </View>
    ),
  };
}

function harnessSource(server: boolean, label: string | undefined): string {
  return `SmartEverything · ${server ? 'Hub' : (label ?? 'Execution host unavailable')}`;
}

function harnessBinding(chat: AiChatRow, state: AiHarnessSession | undefined): string | null {
  if (state === undefined || chat.engine.kind !== 'dsh') return null;
  return state.session_id !== chat.engine.session_id ||
    harnessTargetKey(state.target) !== harnessTargetKey(chat.engine.execution_target) ||
    state.metadata.profile_id !== chat.profile_id
    ? 'The execution binding changed. Refresh requests to continue.'
    : null;
}

function harnessAdmission(
  profileId: string | null,
  state: AiHarnessSession,
  interaction: AiHarnessInteraction,
): string | null {
  if (profileId !== state.metadata.profile_id)
    return 'Switch to this conversation’s profile, then refresh requests to continue.';
  if (interaction.epoch !== state.epoch)
    return 'This request’s execution epoch is no longer current. Refresh requests to continue.';
  return null;
}
