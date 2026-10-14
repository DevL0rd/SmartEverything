import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { AiChatRow } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { useIsOwner } from '../../../store/selectors';
import { useAgentRunsSupported, useLaunchAgent } from '../data/agent-runs';
import { isComputerEngine } from '../provider/computer-engine';

function LaunchAgentSheet({
  chat,
  open,
  close,
}: {
  readonly chat: AiChatRow;
  readonly open: boolean;
  readonly close: () => void;
}): ReactNode {
  const [task, setTask] = useState('');
  const launch = useLaunchAgent(chat.id);
  return (
    <Sheet title="New agent" open={open} onClose={close} detents={['full']}>
      <View className="gap-section-gap">
        <Text tone="variant">
          The helper receives this task with its own conversation. It inherits this chat’s engine,
          computer and permitted tools.
        </Text>
        <TextField label="Task" value={task} onChange={setTask} multiline />
        <Button
          label="Start agent"
          disabled={task.trim() === ''}
          loading={launch.isPending}
          onPress={() => {
            launch.mutate(
              { task, wait: false, timeoutSeconds: 120 },
              {
                onSuccess: () => {
                  setTask('');
                  close();
                },
              },
            );
          }}
        />
        {launch.error === null ? null : <Text tone="critical">{launch.error.message}</Text>}
      </View>
    </Sheet>
  );
}
export function LaunchAgent({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const owner = useIsOwner();
  const supported = useAgentRunsSupported();
  const [launching, setLaunching] = useState(false);
  if (!supported) return null;
  return (
    <>
      {!isComputerEngine(chat.engine) || owner ? (
        <Button
          label="New agent"
          variant="tonal"
          onPress={() => {
            setLaunching(true);
          }}
        />
      ) : null}
      <LaunchAgentSheet
        chat={chat}
        open={launching}
        close={() => {
          setLaunching(false);
        }}
      />
    </>
  );
}
