import { Fragment, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { AppHref } from './app-href';
import { cn } from '../design/cn';
import { RAIL_PX, type RailWidth } from './frame-layout';
import { Icon, type IconName } from './icon';
import { Interactive } from './interactive';
import { Text } from './text';

export interface RailEntry {
  readonly id: string;
  readonly label: string;
  readonly short?: string | undefined;
  readonly icon: IconName;
  readonly missing: string | null;
  readonly detail: ReactNode;
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
  readonly footer?: ReactNode;
}

const RAIL_WIDTH_STYLE = StyleSheet.create({
  frame: { flexGrow: 0, flexShrink: 0 },
  list: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  icon: { width: RAIL_PX.icon },
  mid: { width: RAIL_PX.mid },
  wide: { width: RAIL_PX.wide },
});

function IconLabel({
  entry,
  selected,
}: {
  readonly entry: RailEntry;
  readonly selected: boolean;
}): ReactNode {
  return (
    <Text
      variant="caption"
      tone={selected ? 'primary' : 'variant'}
      align="center"
      numberOfLines={1}
      className="w-full"
    >
      {entry.short ?? entry.label}
    </Text>
  );
}

export function railEntryLabel(entry: RailEntry): string {
  const count = entry.count === undefined || entry.count === '' ? [] : [entry.count];
  const missing = entry.missing === null ? [] : [entry.missing];
  return [entry.label, ...count, ...missing].join(', ');
}

function WideLabel({ entry }: { readonly entry: RailEntry }): ReactNode {
  return (
    <>
      <View className="min-w-0 flex-1">
        <Text variant="callout" numberOfLines={1}>
          {entry.label}
        </Text>
        {entry.detail}
      </View>
      {entry.count === undefined || entry.count === '' ? null : (
        <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
          {entry.count}
        </Text>
      )}
    </>
  );
}

function RailItem({
  entry,
  rail,
}: {
  readonly entry: RailEntry;
  readonly rail: SectionRailProps;
}): ReactNode {
  const selected = rail.active === entry.id;
  const icon = rail.width === 'icon';
  return (
    <Interactive
      href={rail.hrefOf(entry.id)}
      selected={selected}
      label={railEntryLabel(entry)}
      className={cn(
        'rounded-md',
        icon
          ? 'min-h-14 w-22 flex-col items-center justify-center gap-0.5 px-0.5 py-1.5'
          : 'min-h-12 flex-row items-center gap-3 px-3 py-2',
        selected && 'bg-primary/12',
        entry.missing !== null && 'opacity-60',
      )}
      layerClassName="rounded-md"
    >
      <Icon name={entry.icon} size={24} tone={selected ? 'primary' : 'variant'} />
      {icon ? <IconLabel entry={entry} selected={selected} /> : <WideLabel entry={entry} />}
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
  return width === 'icon' ? (
    <View className="my-1.5 h-hairline w-10 bg-outline-variant" />
  ) : (
    <Text variant="footnote" tone="variant" className="px-3 pt-4">
      {title}
    </Text>
  );
}

function RailList(rail: SectionRailProps): ReactNode {
  return (
    <ScrollView
      accessibilityRole="list"
      accessibilityLabel="Sections"
      style={RAIL_WIDTH_STYLE.list}
      contentContainerClassName={cn(
        'gap-1 pb-4 pr-2 pt-2',
        rail.width === 'icon' && 'items-center',
      )}
    >
      {rail.groups.map((group) => (
        <Fragment key={group.title ?? ''}>
          {group.title === null ? null : <GroupHeading title={group.title} width={rail.width} />}
          {group.entries.map((entry) => (
            <RailItem key={entry.id} entry={entry} rail={rail} />
          ))}
        </Fragment>
      ))}
    </ScrollView>
  );
}

export function SectionRail(rail: SectionRailProps): ReactNode {
  return (
    <View style={[RAIL_WIDTH_STYLE.frame, RAIL_WIDTH_STYLE[rail.width]]}>
      <RailList {...rail} />
      {rail.footer === undefined ? null : <View className="pb-4 pr-2">{rail.footer}</View>}
    </View>
  );
}
