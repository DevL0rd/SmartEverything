import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Href } from 'expo-router';
import type { AutomationRowV3 } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { OverflowButton, type MenuItem } from '../../../components/menu';
import { Switch } from '../../../components/switch';
import { Text } from '../../../components/text';
import { clock } from '../../../format/time';
import type { ListActions } from '../list/list-actions';
import { statusLine } from './detail-model';

export interface HeroProps {
  readonly row: AutomationRowV3;
  readonly sentence: string | null;
  readonly timeZone: string | null;
  readonly edit: Href;
  readonly actions: ListActions;
  readonly onShowVersions: () => void;
}

function menuOf({ row, actions, onShowVersions }: HeroProps): readonly MenuItem[] {
  return [
    {
      label: 'Run for real',
      icon: 'play',
      disabled: !row.enabled,
      onPress: (): void => {
        actions.run(row.id, 'live');
      },
    },
    {
      label: 'Duplicate',
      icon: 'copy',
      onPress: (): void => {
        actions.duplicate(row.id);
      },
    },
    { label: 'History of versions', icon: 'clock', onPress: onShowVersions },
    {
      label: 'Delete',
      icon: 'trash',
      destructive: true,
      onPress: (): void => {
        actions.remove(row.id, row.name);
      },
    },
  ];
}

function LastRun({
  row,
  timeZone,
}: {
  readonly row: AutomationRowV3;
  readonly timeZone: string | null;
}): ReactNode {
  if (row.last_error !== null) {
    return (
      <Text variant="callout" tone="critical">
        {`Last run failed: ${row.last_error}`}
      </Text>
    );
  }
  if (row.last_run_at === null) {
    return (
      <Text variant="footnote" tone="variant">
        Never ran
      </Text>
    );
  }
  return (
    <Text variant="footnote" tone="variant" className="tabular">
      {`Last run ${clock(row.last_run_at, timeZone)}`}
    </Text>
  );
}

export function Hero(props: HeroProps): ReactNode {
  const { row, sentence, timeZone, edit, actions } = props;
  return (
    <Card label={`${row.name}, ${statusLine(row)}`}>
      <View className="flex-row flex-wrap items-start gap-x-4 gap-y-3">
        <View className="min-w-64 flex-1 gap-1">
          <View className="flex-row items-center gap-3">
            <Text variant="title-2" className="min-w-0 flex-1" numberOfLines={2}>
              {row.name}
            </Text>
            <Switch
              label={`${row.name} on`}
              value={row.enabled}
              onChange={(enabled) => {
                actions.toggle(row.id, enabled);
              }}
            />
          </View>
          <Text variant="callout" tone="variant">
            {statusLine(row)}
          </Text>
          {sentence === null ? null : <Text variant="body">{sentence}</Text>}
          <LastRun row={row} timeZone={timeZone} />
          {row.draft === null ? null : <Badge label="Draft changes" tone="primary" />}
        </View>
        <View className="flex-row items-center gap-2">
          <Button label="Edit" icon="pencil" href={edit} />
          <Button
            label="Run test"
            icon="play"
            variant="tonal"
            onPress={() => {
              actions.run(row.id, 'dry');
            }}
          />
          <OverflowButton items={menuOf(props)} label={`${row.name} options`} />
        </View>
      </View>
    </Card>
  );
}
