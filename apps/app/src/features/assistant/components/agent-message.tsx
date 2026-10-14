import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { View } from 'react-native';
import { API_ENDPOINTS as E, type AiAgentRun } from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { useIsOwner } from '../../../store/selectors';
import { agentRunKey } from '../data/agent-runs';
export function AgentMessage({ run }: { readonly run: AiAgentRun }): ReactNode {
  const [text, setText] = useState('');
  const [turn, setTurn] = useState('');
  const owner = useIsOwner();
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (action: 'send' | 'steer') =>
      api().call(E.controlAiAgentRun, {
        params: { chatId: run.parent_chat_id, agentRunId: run.id },
        body: action === 'send' ? { action, text } : { action, text, expected_turn_id: turn },
      }),
    onSuccess: () => {
      setText('');
      void client.invalidateQueries({ queryKey: agentRunKey(run.parent_chat_id) });
    },
  });
  const actions = run.supported_actions.filter((action) => action === 'send' || action === 'steer');
  if (actions.length === 0 || (!owner && run.source !== 'smarteverything' && run.source !== 'dsh'))
    return null;
  return (
    <View className="gap-3">
      <TextField label="Follow-up for this agent" value={text} onChange={setText} multiline />
      {actions.includes('steer') ? (
        <TextField label="Exact active turn ID" value={turn} onChange={setTurn} />
      ) : null}
      {actions.map((action) => (
        <Button
          key={action}
          label={action === 'send' ? 'Send follow-up' : 'Steer agent'}
          loading={mutation.isPending}
          disabled={text.trim() === '' || (action === 'steer' && turn.trim() === '')}
          onPress={() => {
            mutation.mutate(action);
          }}
        />
      ))}
      {mutation.error === null ? null : <Text tone="critical">{mutation.error.message}</Text>}
    </View>
  );
}
