import type { ReactNode } from 'react';
import { Fragment, useState } from 'react';
import { View } from 'react-native';
import { LISTENING_SOURCE_KIND_LABELS } from '@smarteverything/domain';
import { Card } from '../../../components/card';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import {
  KIND_ICONS,
  KIND_NOUNS,
  isListening,
  masterOf,
  switchable,
  type ListeningGroup,
} from './listening-model';
import type { RowActions } from './row-actions';
import { SourceRow } from './listening-row';
import type { SwitchKey } from './use-listening-actions';
import { SourceSwitch } from './source-switch';

const COLLAPSED_ROWS = 6;

const MASTER_FROM = 4;

function Masters({
  group,
  offline,
  onAll,
}: {
  readonly group: ListeningGroup;
  readonly offline: boolean;
  readonly onAll: (group: ListeningGroup, key: SwitchKey, value: boolean) => void;
}): ReactNode {
  const who = `All ${LISTENING_SOURCE_KIND_LABELS[group.kind].toLowerCase()}`;
  const wake = masterOf(group.rows, 'wake');
  const write = masterOf(group.rows, 'transcribe');
  return (
    <View
      role="group"
      accessibilityLabel={who}
      className="flex-row gap-6 px-1 medium:w-72 medium:gap-4 medium:px-0 medium:pr-4"
    >
      <SourceSwitch
        label="Wake"
        who={who}
        value={wake.value}
        mixed={wake.mixed}
        disabled={offline}
        fixed={false}
        onChange={(value) => {
          onAll(group, 'wake', value);
        }}
        className="flex-1 medium:w-24 medium:flex-none"
      />
      <SourceSwitch
        label="Write down"
        who={who}
        value={write.value}
        mixed={write.mixed}
        disabled={offline}
        fixed={false}
        onChange={(value) => {
          onAll(group, 'transcribe', value);
        }}
        className="flex-1 medium:w-36 medium:flex-none"
      />
    </View>
  );
}

function GroupHead({
  group,
  offline,
  onAll,
}: {
  readonly group: ListeningGroup;
  readonly offline: boolean;
  readonly onAll: (group: ListeningGroup, key: SwitchKey, value: boolean) => void;
}): ReactNode {
  const listening = group.rows.filter(isListening).length;
  const masters = group.rows.filter(switchable).length >= MASTER_FROM;
  return (
    <View className="gap-1 pl-1 medium:flex-row medium:items-center medium:justify-between">
      <View className="min-w-0 flex-row items-center gap-2">
        <Icon name={KIND_ICONS[group.kind]} size={20} />
        <Text variant="title-3" accessibilityRole="header">
          {LISTENING_SOURCE_KIND_LABELS[group.kind]}
        </Text>
        <Text variant="footnote" tone="variant">
          {group.kind === 'walkie'
            ? `${String(group.rows.length)} channels`
            : `${String(listening)} of ${String(group.rows.length)} listening`}
        </Text>
      </View>
      {masters ? <Masters group={group} offline={offline} onAll={onAll} /> : null}
    </View>
  );
}

function MoreRow({
  open,
  hidden,
  noun,
  onPress,
}: {
  readonly open: boolean;
  readonly hidden: number;
  readonly noun: string;
  readonly onPress: () => void;
}): ReactNode {
  const label = open ? `Show fewer ${noun}s` : `Show ${String(hidden)} more ${noun}s`;
  return (
    <Interactive
      role="button"
      label={label}
      expanded={open}
      onPress={onPress}
      className="min-h-touch-min flex-row items-center justify-center gap-2 px-4"
    >
      <Icon name={open ? 'chevronUp' : 'chevronDown'} size={20} />
      <Text variant="callout">{label}</Text>
    </Interactive>
  );
}

export function SourceGroup({
  group,
  actions,
  onAll,
}: {
  readonly group: ListeningGroup;
  readonly actions: RowActions;
  readonly onAll: (group: ListeningGroup, key: SwitchKey, value: boolean) => void;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const folds = group.kind === 'camera' && group.rows.length > COLLAPSED_ROWS;
  const shown = folds && !open ? group.rows.slice(0, COLLAPSED_ROWS) : group.rows;
  return (
    <View className="gap-2">
      <GroupHead group={group} offline={actions.offline} onAll={onAll} />
      <Card padding="none" className="gap-0 overflow-hidden">
        {shown.map((row, index) => (
          <Fragment key={row.source.key}>
            {index === 0 ? null : <View className="h-hairline bg-outline-variant" />}
            <SourceRow row={row} actions={actions} />
          </Fragment>
        ))}
        {folds ? (
          <>
            <View className="h-hairline bg-outline-variant" />
            <MoreRow
              open={open}
              hidden={group.rows.length - COLLAPSED_ROWS}
              noun={KIND_NOUNS[group.kind]}
              onPress={() => {
                setOpen(!open);
              }}
            />
          </>
        ) : null}
      </Card>
    </View>
  );
}
