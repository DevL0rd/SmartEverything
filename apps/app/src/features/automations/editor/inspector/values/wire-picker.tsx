import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { FlowType, PortValue, Wire } from '@smarteverything/domain';
import { categoryName } from '@smarteverything/domain';
import { Badge } from '../../../../../components/badge';
import { Icon, isIconName } from '../../../../../components/icon';
import { IconWell } from '../../../../../components/icon-well';
import { Interactive } from '../../../../../components/interactive';
import { SearchField } from '../../../../../components/search-field';
import { Text } from '../../../../../components/text';
import { categoryColour } from '../../../../../design/node-colours';
import type { WireChoice, WireGroup } from './wire-model';
import { currentWire, filterGroups, wireGroups, wireLabel, wireValue } from './wire-model';
import { useValueServices } from './value-services';

const SEARCH_FROM = 12;

export interface WirePickerProps {
  readonly nodeKey: string;
  readonly expected: FlowType | undefined;
  readonly value: PortValue | undefined;
  readonly disabled: boolean;
  readonly onPick: (value: PortValue) => void;
}

function GroupHeader({ group }: { readonly group: WireGroup }): ReactNode {
  const colour = categoryColour(group.category === undefined ? '' : categoryName(group.category));
  return (
    <View className="flex-row items-center gap-2 pt-2">
      {group.icon !== undefined && isIconName(group.icon) ? (
        <IconWell icon={group.icon} colour={colour} size="s" />
      ) : null}
      <Text variant="footnote" tone="variant" accessibilityRole="header">
        {group.label}
      </Text>
    </View>
  );
}

function ChoiceRow({
  group,
  choice,
  selected,
  disabled,
  onPick,
}: {
  readonly group: WireGroup;
  readonly choice: WireChoice;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onPick: (value: PortValue) => void;
}): ReactNode {
  return (
    <View className="gap-1">
      <Interactive
        label={`${group.label} › ${choice.label}`}
        selected={selected}
        disabled={disabled || choice.hint !== undefined}
        onPress={() => {
          onPick(wireValue(choice));
        }}
        className="min-h-control-h flex-row items-center gap-2 rounded-md px-3"
        layerClassName="rounded-md"
      >
        <Text variant="body" className="flex-1" numberOfLines={1}>
          {choice.label}
        </Text>
        <Badge label={choice.typeLabel} />
        {selected ? <Icon name="check" size={16} tone="primary" /> : null}
      </Interactive>
      {choice.hint === undefined ? null : (
        <Text variant="footnote" tone="variant" className="px-3">
          {choice.hint}
        </Text>
      )}
    </View>
  );
}

function Groups({
  groups,
  current,
  disabled,
  onPick,
}: {
  readonly groups: readonly WireGroup[];
  readonly current: Wire | undefined;
  readonly disabled: boolean;
  readonly onPick: (value: PortValue) => void;
}): ReactNode {
  return groups.map((group) => (
    <View key={group.id} className="gap-1">
      <GroupHeader group={group} />
      {group.choices.map((choice) => (
        <ChoiceRow
          key={choice.ref}
          group={group}
          choice={choice}
          disabled={disabled}
          selected={current?.from === group.root && current.port === choice.output}
          onPick={onPick}
        />
      ))}
    </View>
  ));
}

export function WirePicker({
  nodeKey,
  expected,
  value,
  disabled,
  onPick,
}: WirePickerProps): ReactNode {
  const { env } = useValueServices();
  const [query, setQuery] = useState('');
  const all = wireGroups({ index: env.index, registry: env.registry, ownerKey: nodeKey, expected });
  const groups = filterGroups(all, query);
  const currentText = wireLabel(value, env.scope);
  const total = all.reduce((sum, group) => sum + group.choices.length, 0);
  return (
    <View className="gap-1">
      {currentText === undefined ? null : <Text variant="callout">{`Now: ${currentText}`}</Text>}
      {total > SEARCH_FROM ? (
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search earlier steps"
          variant="field"
        />
      ) : null}
      <Text variant="footnote" tone="variant">
        From earlier steps
      </Text>
      {groups.length === 0 ? (
        <Text variant="callout" tone="variant">
          Nothing earlier fits here yet.
        </Text>
      ) : null}
      <Groups groups={groups} current={currentWire(value)} disabled={disabled} onPick={onPick} />
    </View>
  );
}
