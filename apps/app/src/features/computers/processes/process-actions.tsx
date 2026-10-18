import type { ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import type { ProcessRow } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { confirm } from '../../../components/confirm-store';
import { useProcessSignal } from '../data/computer-processes';
import { endTitle, forceTitle } from './process-sort';

async function ask(row: ProcessRow, force: boolean): Promise<boolean> {
  return confirm({
    title: force ? forceTitle(row.name) : endTitle(row.name),
    body: force ? 'It closes at once and unsaved work is lost.' : 'Unsaved work in it may be lost.',
    confirmLabel: force ? 'Force quit' : 'End',
    tone: 'destructive',
  });
}

function PauseButton({
  deviceId,
  row,
  disabled,
}: {
  readonly deviceId: string;
  readonly row: ProcessRow;
  readonly disabled: boolean;
}): ReactNode {
  const signal = useProcessSignal(deviceId);
  const paused = row.state === 'stopped';
  return (
    <Button
      label={paused ? 'Resume' : 'Pause'}
      variant="tonal"
      icon={paused ? 'play' : 'pause'}
      disabled={disabled}
      loading={signal.isPending}
      onPress={() => {
        signal.mutate({ pid: row.pid, name: row.name, signal: paused ? 'continue' : 'stop' });
      }}
    />
  );
}

export function ProcessActions({
  deviceId,
  row,
  disabled,
  onGone,
}: {
  readonly deviceId: string;
  readonly row: ProcessRow;
  readonly disabled: boolean;
  readonly onGone: () => void;
}): ReactNode {
  const signal = useProcessSignal(deviceId);
  const run = async (kind: 'end' | 'force'): Promise<void> => {
    if (!(await ask(row, kind === 'force'))) return;
    const outcome = await signal.mutateAsync({ pid: row.pid, name: row.name, signal: kind });
    if (outcome === 'sent') onGone();
  };
  const pending = (kind: string): boolean => signal.isPending && signal.variables.signal === kind;
  return (
    <View className="flex-row flex-wrap gap-2">
      <Button
        label="End"
        variant="destructive"
        disabled={disabled}
        loading={pending('end')}
        onPress={() => {
          background(run('end'), 'process_actions.end_failed');
        }}
      />
      <Button
        label="Force quit"
        variant="tonal"
        disabled={disabled}
        loading={pending('force')}
        onPress={() => {
          background(run('force'), 'process_actions.force_failed');
        }}
      />
      <PauseButton deviceId={deviceId} row={row} disabled={disabled} />
    </View>
  );
}
