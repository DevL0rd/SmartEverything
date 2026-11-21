import { memo, useRef, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { Bars } from '../../../components/charts';
import { Grid } from '../../../components/grid';
import { HScroller } from '../../../components/h-scroller';
import { IconWell } from '../../../components/icon-well';
import { Interactive } from '../../../components/interactive';
import { OverflowButton, type MenuItem } from '../../../components/menu';
import { Text } from '../../../components/text';
import { notifyFailure } from '../../../components/toast-store';
import { cn } from '../../../design/cn';
import { count } from '../../../format/number';
import type { EntityStore } from '../../../store/entity-store';
import { useEntityStore } from '../../../store/store-context';
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

export function smartFolderMenu(
  store: EntityStore,
  folder: SmartFolder,
  rename: () => void,
  onRemoved: () => void,
): readonly MenuItem[] {
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
          removeSmartFolder(store, folder, onRemoved).catch(
            notifyFailure(`${folder.title} was not removed.`),
          ),
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
  if (stats.thisWeek === 0) {
    return (
      <Text variant="caption" tone="variant">
        No new matches this week
      </Text>
    );
  }
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

const NOTHING = (): void => undefined;

function SmartFolderHead({
  folder,
  caption,
  onMore,
}: {
  readonly folder: SmartFolder;
  readonly caption: string;
  readonly onMore: () => readonly MenuItem[];
}): ReactNode {
  return (
    <View className="flex-row items-center gap-3">
      <Interactive
        href={smartFolderHref(folder.id)}
        label={`Open ${folder.title}, ${caption}`}
        className="min-h-touch-min min-w-0 flex-1 flex-row items-center gap-3 rounded-md"
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
      <OverflowButton items={NO_MENU} late={onMore} label={`More for ${folder.title}`} />
    </View>
  );
}

export const SmartFolderCard = memo(function SmartFolderCard({
  folder,
  onRename,
  compact,
}: {
  readonly folder: SmartFolder;
  readonly onRename: RenameSmartFolder;
  readonly compact: boolean;
}): ReactNode {
  const stats = useSmartStats(folder);
  const store = useEntityStore();
  const anchor = useRef<View>(null);
  const caption = smartCaptionOf(folder, stats);
  return (
    <View
      ref={anchor}
      collapsable={false}
      className={cn(
        'gap-3 rounded-lg border-hairline border-outline-variant bg-surface-1 p-4 elevation-1',
        compact ? 'w-72' : 'flex-1',
      )}
    >
      <SmartFolderHead
        folder={folder}
        caption={caption}
        onMore={() =>
          smartFolderMenu(
            store,
            folder,
            () => {
              onRename(folder, anchor);
            },
            NOTHING,
          )
        }
      />
      <RuleBadges rule={folder.rule} />
      {compact ? null : <MatchBars folder={folder} stats={stats} />}
    </View>
  );
});

const CARD_MIN_WIDTH = 288;

function Cards({
  folders,
  onRename,
  compact,
}: {
  readonly folders: readonly SmartFolder[];
  readonly onRename: RenameSmartFolder;
  readonly compact: boolean;
}): ReactNode {
  const cards = folders.map((folder) => (
    <SmartFolderCard key={folder.id} folder={folder} onRename={onRename} compact={compact} />
  ));
  if (!compact) {
    return (
      <Grid minItemWidth={CARD_MIN_WIDTH} stretchLastRow={false}>
        {cards}
      </Grid>
    );
  }
  return (
    <View className="-mx-gutter">
      <HScroller label="Smart folders" fade>
        <View className="flex-row items-stretch gap-3 px-gutter pb-1">{cards}</View>
      </HScroller>
    </View>
  );
}

export function SmartFolders({
  folders,
  onRename,
  compact,
}: {
  readonly folders: readonly SmartFolder[];
  readonly onRename: RenameSmartFolder;
  readonly compact: boolean;
}): ReactNode {
  if (folders.length === 0) return null;
  return (
    <View className="gap-2">
      <SectionHead title="Smart folders" note={SMART_NOTE} />
      <Cards folders={folders} onRename={onRename} compact={compact} />
    </View>
  );
}
