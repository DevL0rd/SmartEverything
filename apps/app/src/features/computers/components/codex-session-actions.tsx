import { useState, type ReactNode } from 'react';
import { randomUUID } from 'expo-crypto';
import { View } from 'react-native';
import {
  CODEX_AI_EXECUTE,
  type CodexAiExecute,
  type ComputerRuntimeCapabilities,
} from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { SelectRow } from '../../../components/rows';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { useCodexExecute } from '../data/computer-runtime';
import { useCodexOperation } from '../data/codex-operation';
import { NativeOperationFeedback } from './native-operation';
const ACTIONS = [
  { value: 'resume', label: 'Resume session' },
  { value: 'send', label: 'Send message' },
  { value: 'steer', label: 'Steer current turn' },
  { value: 'interrupt', label: 'Interrupt current turn' },
  { value: 'rename', label: 'Rename session' },
  { value: 'fork', label: 'Fork session' },
  { value: 'archive', label: 'Archive session' },
  { value: 'unarchive', label: 'Unarchive session' },
  { value: 'delete', label: 'Delete native session' },
] as const;
type Action = (typeof ACTIONS)[number]['value'];
function request(action: Action, sessionId: string, text: string, turn: string): CodexAiExecute {
  const base = { operation: action, operation_id: randomUUID(), session_id: sessionId };
  return CODEX_AI_EXECUTE.parse({
    ...base,
    ...(action === 'send' || action === 'steer' ? { text } : {}),
    ...(action === 'steer' ? { expected_turn_id: turn } : {}),
    ...(action === 'interrupt' ? { turn_id: turn } : {}),
    ...(action === 'rename' ? { title: text } : {}),
  });
}
export function CodexSessionActions({
  deviceId,
  sessionId,
  capabilities,
}: {
  readonly deviceId: string;
  readonly sessionId: string;
  readonly capabilities: ComputerRuntimeCapabilities;
}): ReactNode {
  const [action, choose] = useState<Action>('resume');
  const [text, setText] = useState('');
  const [turn, setTurn] = useState('');
  const [confirm, setConfirm] = useState('');
  const execute = useCodexExecute(deviceId);
  const operation = useCodexOperation(deviceId, execute.data, execute.variables, execute.error);

  const enabled = capabilities.operations.includes(action);
  return (
    <View className="gap-3">
      <ActionSelect action={action} choose={choose} />
      <ActionInputs
        action={action}
        text={text}
        setText={setText}
        turn={turn}
        setTurn={setTurn}
        confirm={confirm}
        setConfirm={setConfirm}
      />
      {enabled ? null : (
        <Text tone="variant">
          {capabilities.unavailable_operations?.[action] ?? 'Unavailable in this runtime'}
        </Text>
      )}
      <Button
        label={ACTIONS.find((row) => row.value === action)?.label ?? 'Run action'}
        loading={execute.isPending}
        disabled={!enabled || operation.blocked || !actionReady(action, text, turn, confirm)}
        onPress={() => {
          execute.mutate(request(action, sessionId, text, turn));
        }}
      />
      <NativeOperationFeedback operation={operation} />
    </View>
  );
}

function actionReady(action: Action, text: string, turn: string, confirm: string): boolean {
  if ((action === 'send' || action === 'steer' || action === 'rename') && text.trim() === '')
    return false;
  if ((action === 'interrupt' || action === 'steer') && turn.trim() === '') return false;
  return action !== 'delete' || confirm === 'DELETE';
}
function ActionInputs({
  action,
  text,
  setText,
  turn,
  setTurn,
  confirm,
  setConfirm,
}: {
  readonly action: Action;
  readonly text: string;
  readonly setText: (value: string) => void;
  readonly turn: string;
  readonly setTurn: (value: string) => void;
  readonly confirm: string;
  readonly setConfirm: (value: string) => void;
}): ReactNode {
  const needsText = action === 'send' || action === 'steer' || action === 'rename';
  const needsTurn = action === 'interrupt' || action === 'steer';
  return (
    <>
      {needsText ? (
        <TextField
          label={action === 'rename' ? 'New title' : 'Message'}
          multiline
          value={text}
          onChange={setText}
        />
      ) : null}
      {needsTurn ? (
        <TextField
          label="Exact active turn ID"
          value={turn}
          onChange={setTurn}
          helper="Use the turn ID shown in native published activity. A changed turn is rejected."
        />
      ) : null}
      {action === 'delete' ? (
        <TextField
          label="Type DELETE to confirm"
          value={confirm}
          onChange={setConfirm}
          helper="Deletes this exact native session permanently."
        />
      ) : null}
    </>
  );
}

function ActionSelect({
  action,
  choose,
}: {
  readonly action: Action;
  readonly choose: (value: Action) => void;
}): ReactNode {
  return (
    <SelectRow
      title="Native action"
      value={action}
      options={ACTIONS}
      onChange={(value) => {
        const selected = ACTIONS.find((row) => row.value === value);
        if (selected !== undefined) choose(selected.value);
      }}
    />
  );
}
