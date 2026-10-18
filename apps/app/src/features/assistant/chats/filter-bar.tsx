import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { HScroller } from '../../../components/h-scroller';
import { useRow } from '../../../store/selectors';
import { pluginIcon } from '../../plugins';
import type { ChatSourceKind } from '../model/chat-source';
import type { ChatFilter, FilterCounts, SourceOption } from './list-filters';

const SOURCE_ICON: Readonly<Record<Exclude<ChatSourceKind, 'plugin'>, IconName>> = {
  app: 'sparkles',
  branch: 'gitBranch',
  call: 'phone',
  camera: 'camera',
  schedule: 'clock',
};

function Chip({
  label,
  count,
  icon,
  active,
  onPress,
}: {
  readonly label: string;
  readonly count?: number;
  readonly icon?: IconName;
  readonly active: boolean;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Interactive
      label={count === undefined || count === 0 ? label : `${label}, ${String(count)}`}
      selected={active}
      onPress={onPress}
      className={cn(
        'min-h-touch-min flex-row items-center gap-1.5 rounded-full border-hairline px-3',
        active ? 'border-primary bg-primary-container' : 'border-outline-variant bg-surface-1',
      )}
      layerClassName="rounded-full"
    >
      {icon === undefined ? null : (
        <Icon name={icon} size={16} tone={active ? 'primary' : 'variant'} />
      )}
      <Text variant="label" tone={active ? 'primary' : 'default'} numberOfLines={1}>
        {label}
      </Text>
      {count === undefined || count === 0 ? null : (
        <Text variant="caption" tone="variant" className="tabular">
          {count}
        </Text>
      )}
    </Interactive>
  );
}

function SourceChip({
  option,
  active,
  onPress,
}: {
  readonly option: SourceOption;
  readonly active: boolean;
  readonly onPress: () => void;
}): ReactNode {
  const plugin = useRow('plugins', option.pluginId);
  const icon =
    option.kind === 'plugin'
      ? plugin === null
        ? 'puzzle'
        : pluginIcon(plugin.manifest)
      : SOURCE_ICON[option.kind];
  return <Chip label={option.label} icon={icon} active={active} onPress={onPress} />;
}

function SourceChips({
  filter,
  options,
  onChange,
}: {
  readonly filter: ChatFilter;
  readonly options: readonly SourceOption[];
  readonly onChange: (filter: ChatFilter) => void;
}): ReactNode {
  return options.map((option) => (
    <SourceChip
      key={option.filter}
      option={option}
      active={filter === option.filter}
      onPress={() => {
        onChange(option.filter);
      }}
    />
  ));
}

const COUNT_CHIPS = [
  { filter: 'unread', label: 'Unread' },
  { filter: 'needs', label: 'Needs you' },
  { filter: 'running', label: 'Running' },
] as const;

function CountChips({
  filter,
  counts,
  onChange,
}: {
  readonly filter: ChatFilter;
  readonly counts: FilterCounts;
  readonly onChange: (filter: ChatFilter) => void;
}): ReactNode {
  return COUNT_CHIPS.map((chip) => {
    const count = counts[chip.filter];
    return count > 0 || filter === chip.filter ? (
      <Chip
        key={chip.filter}
        label={chip.label}
        count={count}
        active={filter === chip.filter}
        onPress={() => {
          onChange(chip.filter);
        }}
      />
    ) : null;
  });
}

export function FilterBar({
  filter,
  counts,
  onChange,
}: {
  readonly filter: ChatFilter;
  readonly counts: FilterCounts;
  readonly onChange: (filter: ChatFilter) => void;
}): ReactNode {
  const choose = (next: ChatFilter) => (): void => {
    onChange(next);
  };
  return (
    <HScroller label="Chat filters">
      <View className="flex-row items-center gap-2 px-gutter">
        <Chip label="All" active={filter === 'all'} onPress={choose('all')} />
        <CountChips filter={filter} counts={counts} onChange={onChange} />
        <Chip label="Pinned" active={filter === 'pinned'} onPress={choose('pinned')} />
        <SourceChips filter={filter} options={counts.sources} onChange={onChange} />
        <Chip
          label="Archived"
          icon="archive"
          active={filter === 'archived'}
          onPress={choose('archived')}
        />
      </View>
    </HScroller>
  );
}
