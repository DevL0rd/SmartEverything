import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { FilterChip } from '../../../components/filter-chip';
import { IconWell } from '../../../components/icon-well';
import { Text } from '../../../components/text';
import { plural } from '../../../format/text';
import { RANGE_LOOK, type ActivityRange, type FolderCount, type OutsideSummary } from './via-model';

export interface OutsideCalloutProps {
  readonly summary: OutsideSummary;
  readonly range: ActivityRange;
  readonly showingOnly: boolean;
  readonly folderKey: string | null;
  readonly onShowOnly: () => void;
  readonly onFolder: (folder: FolderCount) => void;
}

export function outsideBody(total: number, range: ActivityRange): string {
  return `${plural(total, 'change')} made straight on the disks ${RANGE_LOOK[range].phrase}, not through the app, sync or the mount`;
}

export function OutsideCallout({
  summary,
  range,
  showingOnly,
  folderKey,
  onShowOnly,
  onFolder,
}: OutsideCalloutProps): ReactNode {
  if (summary.count === 0) return null;
  return (
    <Card tone="attention">
      <View className="flex-row items-start gap-3">
        <IconWell icon="alert" colour="primary" />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="body-strong">Changed outside SmartEverything</Text>
          <Text variant="callout" tone="variant">
            {outsideBody(summary.count, range)}
          </Text>
        </View>
      </View>
      <View className="flex-row flex-wrap gap-x-2">
        {summary.folders.map((folder) => (
          <FilterChip
            key={folder.key}
            label="Folder"
            value={folder.label}
            icon="folder"
            count={folder.count}
            active={folder.key === folderKey}
            onPress={() => {
              onFolder(folder);
            }}
          />
        ))}
      </View>
      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-2">
        {showingOnly ? null : (
          <Button label="Show only these" icon="filter" variant="tonal" onPress={onShowOnly} />
        )}
        <Text variant="caption" tone="variant" className="min-w-0 flex-1">
          Seen by the disk watcher, so who made them is unknown.
        </Text>
      </View>
    </Card>
  );
}
