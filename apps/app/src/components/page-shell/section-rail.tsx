import { Fragment, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { AppHref } from '../app-href';
import { cn } from '../../design/cn';
import { RAIL_PX, stackedRail, type RailWidth } from './layout';
import { Icon, type IconName } from '../icon';
import { Interactive, type LinkNavigation } from '../interactive';
import { Text } from '../text';

export interface RailEntry {
  readonly id: string;
  readonly label: string;
  readonly short?: string | undefined;
  readonly icon: IconName;
  readonly missing: string | null;
  readonly count?: string | undefined;
}

export interface RailGroup {
  readonly title: string | null;
  readonly entries: readonly RailEntry[];
}

export interface SectionRailProps {
  readonly groups: readonly RailGroup[];
  readonly active: string;
  readonly width: RailWidth;
  readonly hrefOf: (id: string) => AppHref;
  readonly navigation?: LinkNavigation | undefined;
  readonly label: string;
  readonly footer?: ReactNode;
  readonly safeTop: boolean;
}

const RAIL_WIDTH_STYLE = StyleSheet.create({
  list: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  compact: { width: RAIL_PX.compact },
  icon: { width: RAIL_PX.icon },
  mid: { width: RAIL_PX.mid },
  wide: { width: RAIL_PX.wide },
});

export function railEntryLabel(entry: RailEntry): string {
  const count = entry.count === undefined || entry.count === '' ? [] : [entry.count];
  const missing = entry.missing === null ? [] : [entry.missing];
  return [entry.label, ...count, ...missing].join(', ');
}

function StackedFace({
  entry,
  selected,
}: {
  readonly entry: RailEntry;
  readonly selected: boolean;
}): ReactNode {
  return (
    <>
      <View
        className={cn(
          'h-8 w-16 items-center justify-center rounded-full',
          selected && 'bg-primary-container',
        )}
      >
        <View className={cn(entry.missing !== null && 'opacity-50')}>
          <Icon name={entry.icon} size={24} tone={selected ? 'primary' : 'variant'} />
        </View>
      </View>
      <Text
        variant="caption"
        tone={selected ? 'default' : 'variant'}
        align="center"
        numberOfLines={2}
        className="w-full"
      >
        {entry.short ?? entry.label}
      </Text>
    </>
  );
}

function rowTone(entry: RailEntry, selected: boolean): 'primary' | 'default' | 'variant' {
  if (selected) return 'primary';
  return entry.missing === null ? 'default' : 'variant';
}

function RowFace({
  entry,
  selected,
}: {
  readonly entry: RailEntry;
  readonly selected: boolean;
}): ReactNode {
  return (
    <>
      <View className={cn(entry.missing !== null && 'opacity-50')}>
        <Icon name={entry.icon} size={20} tone={selected ? 'primary' : 'variant'} />
      </View>
      <Text variant="label" tone={rowTone(entry, selected)} className="flex-1" numberOfLines={1}>
        {entry.label}
      </Text>
      {entry.count === undefined || entry.count === '' ? null : (
        <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
          {entry.count}
        </Text>
      )}
    </>
  );
}

export function RailItem({
  entry,
  rail,
}: {
  readonly entry: RailEntry;
  readonly rail: SectionRailProps;
}): ReactNode {
  const selected = rail.active === entry.id;
  const stacked = stackedRail(rail.width);
  return (
    <Interactive
      href={rail.hrefOf(entry.id)}
      navigation={rail.navigation}
      selected={selected}
      label={railEntryLabel(entry)}
      className={cn(
        stacked
          ? 'min-h-14 w-full items-center justify-center gap-1 py-1'
          : 'h-10 min-h-touch-min flex-row items-center gap-3 rounded-full px-4',
        !stacked && selected && 'bg-primary-container',
      )}
      layerClassName="rounded-full"
    >
      {stacked ? (
        <StackedFace entry={entry} selected={selected} />
      ) : (
        <RowFace entry={entry} selected={selected} />
      )}
    </Interactive>
  );
}

function GroupHeading({
  title,
  width,
}: {
  readonly title: string;
  readonly width: RailWidth;
}): ReactNode {
  return stackedRail(width) ? (
    <View className="my-1.5 h-hairline w-10 self-center bg-outline-variant" />
  ) : (
    <Text variant="caption" tone="faint" className="px-4 pb-1 pt-3">
      {title}
    </Text>
  );
}

function RailGroups({ rail }: { readonly rail: SectionRailProps }): ReactNode {
  return rail.groups.map((group, index) => (
    <Fragment key={group.title ?? ''}>
      {group.title === null || (index === 0 && stackedRail(rail.width)) ? null : (
        <GroupHeading title={group.title} width={rail.width} />
      )}
      {group.entries.map((entry) => (
        <RailItem key={entry.id} entry={entry} rail={rail} />
      ))}
    </Fragment>
  ));
}

export function SectionRail(rail: SectionRailProps): ReactNode {
  return (
    <View
      style={RAIL_WIDTH_STYLE[rail.width]}
      className={cn(
        'shrink-0 grow-0 border-r border-outline-variant bg-chrome',
        stackedRail(rail.width) ? 'px-1' : 'px-3',
        rail.safeTop && 'pt-safe',
      )}
    >
      <ScrollView
        accessibilityRole="list"
        accessibilityLabel={rail.label}
        style={RAIL_WIDTH_STYLE.list}
        contentContainerClassName="gap-1 pb-3 pt-3"
      >
        <RailGroups rail={rail} />
      </ScrollView>
      {rail.footer === undefined ? null : <View className="pb-3">{rail.footer}</View>}
    </View>
  );
}
