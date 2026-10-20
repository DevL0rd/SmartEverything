import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { IconWell } from '../../../components/icon-well';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { OverflowButton, useContextMenu } from '../../../components/menu';
import { Switch } from '../../../components/switch';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { clock } from '../../../format/time';
import { CHIP_LABELS, sameEntry, type ListEntry } from './list-entries';
import type { ListActions } from './list-actions';
import type { ListLinks } from './list-links';
import { RunBars } from './run-bars';
import { statsLine } from './run-stats';
import { useRowMenu } from './row-menu';

export interface AutomationRowProps {
  readonly entry: ListEntry;
  readonly icon: IconName;
  readonly links: ListLinks;
  readonly actions: ListActions;
  readonly timeZone: string | null;
  readonly selected?: boolean;
}

function Footer({
  entry,
  timeZone,
}: {
  readonly entry: ListEntry;
  readonly timeZone: string | null;
}): ReactNode {
  const failed = entry.lastError !== null;
  return (
    <View className="flex-row items-center gap-3 pt-1">
      <RunBars stats={entry.stats} />
      <Text variant="caption" tone="variant" numberOfLines={1} className="min-w-0 flex-1">
        {entry.runCount === 0 ? 'Never ran' : statsLine(entry.stats, entry.runCount)}
      </Text>
      {entry.lastRunAt === null ? null : (
        <View className="flex-row items-center gap-1">
          <Text variant="caption" tone="variant" className="tabular">
            {`Last run ${clock(entry.lastRunAt, timeZone)}`}
          </Text>
          <Icon
            name={failed ? 'alert' : 'check'}
            size={16}
            tone={failed ? 'critical' : 'positive'}
          />
        </View>
      )}
    </View>
  );
}

function Body({
  entry,
  timeZone,
}: {
  readonly entry: ListEntry;
  readonly timeZone: string | null;
}): ReactNode {
  const failed = entry.lastError !== null;
  return (
    <View className="min-w-0 flex-1 gap-1">
      <Text variant="title-3" numberOfLines={1}>
        {entry.name}
      </Text>
      <Text variant="callout" tone={failed ? 'critical' : 'variant'} numberOfLines={2}>
        {entry.lastError === null
          ? (entry.sentence ?? 'Not finished yet')
          : `Last run failed: ${entry.lastError}`}
      </Text>
      {entry.chips.length === 0 ? null : (
        <View className="flex-row flex-wrap gap-1.5">
          {entry.chips.map((chip) => (
            <Badge
              key={chip}
              label={CHIP_LABELS[chip]}
              tone={chip === 'update' ? 'warning' : 'neutral'}
            />
          ))}
        </View>
      )}
      <Footer entry={entry} timeZone={timeZone} />
    </View>
  );
}

function AutomationRowView({
  entry,
  icon,
  links,
  actions,
  timeZone,
  selected = false,
}: AutomationRowProps): ReactNode {
  const items = useRowMenu(entry, links, actions);
  const menu = useContextMenu(items, `${entry.name} actions`);
  return (
    <View
      className={cn(
        'flex-row items-start rounded-lg border-hairline bg-surface-1 elevation-1',
        selected ? 'border-primary' : 'border-outline-variant',
        !entry.enabled && 'opacity-80',
      )}
    >
      <Interactive
        href={links.open(entry.id)}
        label={`${entry.name}${entry.enabled ? '' : ', paused'}`}
        onLongPress={menu.onLongPress}
        onContextMenu={menu.onContextMenu}
        selected={selected}
        className="min-w-0 flex-1 flex-row gap-3 p-3 pr-1"
        layerClassName="rounded-lg"
      >
        <IconWell
          icon={icon}
          colour={entry.section === 'attention' ? 'critical' : 'primary'}
          size="m"
        />
        <Body entry={entry} timeZone={timeZone} />
      </Interactive>
      <View className="items-center gap-1 py-3 pl-1 pr-2">
        <Switch
          label={`${entry.name} on`}
          value={entry.enabled}
          onChange={(enabled) => {
            actions.toggle(entry.id, enabled);
          }}
        />
        <OverflowButton items={items} label={`${entry.name} options`} />
      </View>
      {menu.host}
    </View>
  );
}

function sameRow(before: AutomationRowProps, after: AutomationRowProps): boolean {
  return (
    sameEntry(before.entry, after.entry) &&
    before.icon === after.icon &&
    before.links === after.links &&
    before.actions === after.actions &&
    before.timeZone === after.timeZone &&
    before.selected === after.selected
  );
}

export const AutomationRow = memo(AutomationRowView, sameRow);
