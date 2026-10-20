import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AutomationRunSummary, RunRecordStatus } from '@smarteverything/domain';
import { Badge } from '../../../../components/badge';
import { Button } from '../../../../components/button';
import { Icon } from '../../../../components/icon';
import { Text } from '../../../../components/text';
import { clock } from '../../../../format/time';
import { RUN_LABELS, durationLabel, runLook, tookMs, triggerText } from '../run-history-model';

const MODE_LABEL = { live: 'Live', dry: 'Dry run', simulated: 'Simulation' } as const;

export const STOP_HINT = 'Stop run. Commands already sent may still finish.';

export interface RunHeaderProps {
  readonly run: AutomationRunSummary;
  readonly status: RunRecordStatus;
  readonly zone: string | null;
  readonly active: boolean;
  readonly canFollow: boolean;
  readonly following: boolean;
  readonly stopping: boolean;
  readonly onFollow: () => void;
  readonly onStop: () => void;
  readonly onReplay: () => void;
  readonly onOpenEditor: () => void;
}

function Summary({
  run,
  status,
  zone,
}: Pick<RunHeaderProps, 'run' | 'status' | 'zone'>): ReactNode {
  const look = runLook(status);
  const took = tookMs(run);
  return (
    <View className="gap-1">
      <View className="flex-row items-center gap-2">
        <Icon name={look.icon} size={20} tone={look.tone} />
        <Text variant="body-strong" tone={look.tone}>
          {RUN_LABELS[status]}
        </Text>
        <Badge label={MODE_LABEL[run.mode]} tone={run.mode === 'live' ? 'primary' : 'neutral'} />
        {took === null ? null : (
          <Text variant="callout" tone="variant" className="tabular">
            {durationLabel(took)}
          </Text>
        )}
      </View>
      <Text variant="footnote" tone="variant">
        {`${triggerText(run)}, ${clock(run.created_at, zone)}`}
      </Text>
    </View>
  );
}

function Actions(props: RunHeaderProps): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      {props.canFollow ? (
        <Button
          label={props.following ? 'Following' : 'Follow'}
          icon="locate"
          variant={props.following ? 'tonal' : 'outlined'}
          onPress={props.onFollow}
        />
      ) : null}
      <Button label="Replay as simulation" variant="outlined" onPress={props.onReplay} />
      <Button label="Open in editor" variant="outlined" onPress={props.onOpenEditor} />
      {props.active ? (
        <Button
          label="Stop"
          variant="destructive"
          hint={STOP_HINT}
          loading={props.stopping}
          onPress={props.onStop}
        />
      ) : null}
    </View>
  );
}

export function RunHeader(props: RunHeaderProps): ReactNode {
  return (
    <View className="gap-3 px-4 py-3">
      <Summary run={props.run} status={props.status} zone={props.zone} />
      <Actions {...props} />
    </View>
  );
}
