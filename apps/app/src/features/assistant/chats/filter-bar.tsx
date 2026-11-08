import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { IconName } from '../../../components/icon';
import { FlatChoice } from '../../../components/flat-choice';
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
  return (
    <FlatChoice role="radio" label={option.label} icon={icon} active={active} onPress={onPress} />
  );
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
      <FlatChoice
        key={chip.filter}
        role="radio"
        label={chip.label}
        count={count === 0 ? undefined : count}
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
    <HScroller label="Chat filters" fade fadeSurface="bg">
      <View
        className="flex-row items-center px-gutter"
        accessibilityRole="radiogroup"
        accessibilityLabel="Chat filters"
      >
        <FlatChoice role="radio" label="All" active={filter === 'all'} onPress={choose('all')} />
        <CountChips filter={filter} counts={counts} onChange={onChange} />
        <FlatChoice
          role="radio"
          label="Pinned"
          active={filter === 'pinned'}
          onPress={choose('pinned')}
        />
        <SourceChips filter={filter} options={counts.sources} onChange={onChange} />
        <FlatChoice
          role="radio"
          label="Archived"
          icon="archive"
          active={filter === 'archived'}
          onPress={choose('archived')}
        />
      </View>
    </HScroller>
  );
}
