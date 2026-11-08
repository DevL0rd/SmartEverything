import { memo, useRef, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { Bars } from '../../../components/charts';
import { IconWell } from '../../../components/icon-well';
import { Interactive } from '../../../components/interactive';
import { OverflowButton, type MenuItem } from '../../../components/menu';
import { Text } from '../../../components/text';
import { notifyFailure } from '../../../components/toast-store';
import { count } from '../../../format/number';
import { plural } from '../../../format/text';
import { RuleBadges } from './rule-chip-view';
import { SectionHead } from './section-head';
import { removeSmartFolder, useSmartStats } from './smart-data';
import {
  matchBarsLabel,
  smartCaptionOf,
  smartFolderHref,
  thisWeekText,
  type SmartFolder,
  type SmartStats,
} from './smart-model';
import { SMART_NOTE } from './starred-model';

const BAR_HEIGHT = 32;

const NO_MENU: readonly MenuItem[] = [];

export type RenameSmartFolder = (folder: SmartFolder, anchorRef: RefObject<View | null>) => void;

function menuOf(folder: SmartFolder, rename: () => void): readonly MenuItem[] {
  return [
    {
      id: 'rename',
      label: 'Rename',
      icon: 'pencil',
      onPress: rename,
    },
    {
      id: 'remove',
      label: 'Remove',
      icon: 'trash',
      destructive: true,
      onPress: (): void => {
        background(
          removeSmartFolder(folder).catch(notifyFailure(`${folder.title} was not removed.`)),
          'drive.smart_folder_remove_failed',
        );
      },
    },
  ];
}

function MatchBars({
  folder,
  stats,
}: {
  readonly folder: SmartFolder;
  readonly stats: SmartStats;
}): ReactNode {
  const week = thisWeekText(stats);
  return (
    <View className="gap-1">
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="caption" tone="variant">
          New matches per day
        </Text>
        {week === null ? null : (
          <Text variant="caption" tone="variant" className="tabular">
            {week}
          </Text>
        )}
      </View>
      {stats.days === null ? null : (
        <Bars
          bars={stats.days.map((day) => ({ key: day.day, value: day.added }))}
          colour="primary"
          label={matchBarsLabel(folder, stats)}
          height={BAR_HEIGHT}
          formatValue={count}
        />
      )}
    </View>
  );
}

export const SmartFolderCard = memo(function SmartFolderCard({
  folder,
  onRename,
}: {
  readonly folder: SmartFolder;
  readonly onRename: RenameSmartFolder;
}): ReactNode {
  const stats = useSmartStats(folder);
  const anchor = useRef<View>(null);
  const caption = smartCaptionOf(folder, stats);
  return (
    <View
      ref={anchor}
      collapsable={false}
      className="min-w-0 flex-1 basis-72 gap-3 rounded-lg border-hairline border-outline-variant bg-surface-1 p-4 elevation-1"
    >
      <View className="flex-row items-center gap-3">
        <Interactive
          href={smartFolderHref(folder.id)}
          label={`Open ${folder.title}, ${caption}`}
          className="min-w-0 flex-1 flex-row items-center gap-3 rounded-md"
          layerClassName="rounded-md"
        >
          <IconWell icon="sparkles" colour="primary" size="s" />
          <View className="min-w-0 flex-1">
            <Text variant="callout" numberOfLines={1} className="font-sans-medium">
              {folder.title}
            </Text>
            <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
              {caption}
            </Text>
          </View>
        </Interactive>
        <OverflowButton
          items={NO_MENU}
          late={() =>
            menuOf(folder, () => {
              onRename(folder, anchor);
            })
          }
          label={`More for ${folder.title}`}
        />
      </View>
      <RuleBadges rule={folder.rule} />
      <MatchBars folder={folder} stats={stats} />
    </View>
  );
});

export function SmartFolders({
  folders,
  onRename,
}: {
  readonly folders: readonly SmartFolder[];
  readonly onRename: RenameSmartFolder;
}): ReactNode {
  if (folders.length === 0) return null;
  return (
    <View className="gap-2">
      <SectionHead
        title="Smart folders"
        note={SMART_NOTE}
        detail={plural(folders.length, 'smart folder')}
      />
      <View className="flex-row flex-wrap gap-3">
        {folders.map((folder) => (
          <SmartFolderCard key={folder.id} folder={folder} onRename={onRename} />
        ))}
      </View>
    </View>
  );
}
