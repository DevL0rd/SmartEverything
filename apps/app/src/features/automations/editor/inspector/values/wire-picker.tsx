import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { FlowType, PortValue, Wire } from '@smarteverything/domain';
import { categoryName } from '@smarteverything/domain';
import { Badge } from '../../../../../components/badge';
import { Button } from '../../../../../components/button';
import { Icon, isIconName } from '../../../../../components/icon';
import { IconWell } from '../../../../../components/icon-well';
import { Interactive } from '../../../../../components/interactive';
import { SearchField } from '../../../../../components/search-field';
import { Text } from '../../../../../components/text';
import { categoryColour } from '../../../../../design/node-colours';
import type { InspectorEnv } from '../sections/section-types';
import type { WireChoice, WireGroup } from './wire-model';
import { currentWire, filterGroups, wireGroups, wireLabel, wireValue } from './wire-model';

export interface WirePickerProps {
  readonly env: InspectorEnv;
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

function Current({
  text,
  open,
  onToggle,
}: {
  readonly text: string;
  readonly open: boolean;
  readonly onToggle: () => void;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-2 rounded-md border border-outline-variant bg-surface-2 pl-3">
      <Icon name="route" size={16} tone="primary" />
      <Text variant="body" className="min-w-0 flex-1" numberOfLines={2}>
        {text}
      </Text>
      <Button
        label={open ? 'Done' : 'Change'}
        spoken={open ? 'Close the list of earlier steps' : `Change the wire from ${text}`}
        variant="text"
        onPress={onToggle}
      />
    </View>
  );
}

function Choices({
  all,
  value,
  disabled,
  onPick,
}: {
  readonly all: readonly WireGroup[];
  readonly value: PortValue | undefined;
  readonly disabled: boolean;
  readonly onPick: (value: PortValue) => void;
}): ReactNode {
  const [query, setQuery] = useState('');
  const groups = filterGroups(all, query);
  return (
    <View className="gap-1">
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Search earlier steps"
        variant="field"
      />
      {groups.length === 0 ? (
        <Text variant="callout" tone="variant">
          Nothing earlier fits here yet.
        </Text>
      ) : null}
      <Groups groups={groups} current={currentWire(value)} disabled={disabled} onPick={onPick} />
    </View>
  );
}

export function WirePicker({
  env,
  nodeKey,
  expected,
  value,
  disabled,
  onPick,
}: WirePickerProps): ReactNode {
  const [open, setOpen] = useState(false);
  const all = wireGroups({ index: env.index, registry: env.registry, ownerKey: nodeKey, expected });
  const currentText = wireLabel(value, env.scope);
  const listed = currentText === undefined || open;
  return (
    <View className="gap-2">
      {currentText === undefined ? (
        <Text variant="footnote" tone="variant">
          Pick a value from an earlier step
        </Text>
      ) : (
        <Current
          text={currentText}
          open={open}
          onToggle={() => {
            setOpen(!open);
          }}
        />
      )}
      {listed ? (
        <Choices
          all={all}
          value={value}
          disabled={disabled}
          onPick={(picked) => {
            setOpen(false);
            onPick(picked);
          }}
        />
      ) : null}
    </View>
  );
}
