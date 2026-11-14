import type { ReactNode } from 'react';
import type { DriveStats } from '@smarteverything/domain';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { Bars } from '../../../components/charts';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { count } from '../../../format/number';
import { useDayKey } from '../../../store/clock';
import { useDriveStats } from '../../drive';
import { usePhotoBackupState } from '../data';
import { folderOf } from '../settings/model';
import { addedInMonth, type AddedMonth } from './stats-model';

function FolderLine(): ReactNode {
  const folder = folderOf(usePhotoBackupState().data);
  return (
    <View className="flex-row items-center gap-2 border-t border-outline-variant pt-3">
      <Icon name="folder" size={16} tone="variant" />
      <Text variant="footnote" numberOfLines={1} className="min-w-0 flex-1">
        {`Backup folder · ${folder}`}
      </Text>
    </View>
  );
}

function DayBars({
  added,
  compact,
}: {
  readonly added: AddedMonth;
  readonly compact: boolean;
}): ReactNode {
  return (
    <View className="gap-1">
      <Bars
        bars={added.bars}
        colour="viz-1"
        label={`Items added per day this month, ${count(added.items)} in all`}
        height={compact ? 48 : 72}
        formatValue={count}
      />
      <View className="flex-row justify-between">
        <Text variant="caption" tone="variant" className="tabular-nums">
          {added.from}
        </Text>
        <Text variant="caption" tone="variant" className="tabular-nums">
          {added.to}
        </Text>
      </View>
    </View>
  );
}

type Growth = DriveStats['growth'];

function emptyText(growth: Growth | undefined): string {
  if (growth === undefined) return 'Loading this month';
  return growth === null ? 'Shows after two months of history' : 'Nothing added this month yet';
}

function AddedBody({
  added,
  growth,
  compact,
}: {
  readonly added: AddedMonth | null;
  readonly growth: Growth | undefined;
  readonly compact: boolean;
}): ReactNode {
  if (added !== null) return <DayBars added={added} compact={compact} />;
  return (
    <Text variant="caption" tone="variant">
      {emptyText(growth)}
    </Text>
  );
}

export function AddedCard({ compact }: { readonly compact: boolean }): ReactNode {
  const stats = useDriveStats();
  const month = useDayKey().slice(0, 7);
  const added = addedInMonth(stats.data?.growth ?? null, month);
  return (
    <Card
      title="Added per day"
      metadata={
        added === null ? null : (
          <Text variant="caption" tone="variant" className="tabular-nums">
            {`This month · ${count(added.items)} ${added.items === 1 ? 'item' : 'items'}`}
          </Text>
        )
      }
    >
      <View className="gap-3">
        <AddedBody added={added} growth={stats.data?.growth} compact={compact} />
        <FolderLine />
      </View>
    </Card>
  );
}
