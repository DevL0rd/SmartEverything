import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  WAKE_SENSITIVITIES,
  WAKE_SENSITIVITY_HINTS,
  WAKE_SENSITIVITY_LABELS,
  type ListeningSourceChange,
  type ListeningSourceKind,
} from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Icon } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Segmented } from '../../../components/segmented';
import { Sheet } from '../../../components/sheet';
import { SwitchRow, ValueRow } from '../../../components/rows';
import { Text } from '../../../components/text';
import { ClaimList } from './claim-list';
import { LevelMeter } from './level-meter';
import { useLevelWatch } from './listening-level';
import {
  KIND_ICONS,
  lookOf,
  switchable,
  type ListeningRow,
  type RowState,
} from './listening-model';
import { pauseNote } from './pause-note';
import { PhoneFixes } from './phone-fixes';
import { SheetNotice } from './sheet-notices';
import { StateMark } from './state-mark';

const METERED: ReadonlySet<ListeningSourceKind> = new Set(['camera', 'phone', 'computer']);

const FIXED_NOTE: Readonly<Partial<Record<ListeningSourceKind, string>>> = {
  walkie: 'Set in the channel’s own settings',
  discord: 'Set in the Discord plugin',
};

const WHY: Readonly<Record<RowState, string>> = {
  listening: 'Streams only while this sheet is open',
  in_conversation: 'Resting while in a conversation',
  off: 'Wake is off',
  privacy: 'The privacy switch is on',
  discord_call: 'Resting while Discord is in a call',
  needs_permission: 'Microphone not allowed',
  no_host: 'No computer is on to listen',
  offline: 'Offline',
  blocked: 'Blocked by setting',
};

const WRITE_NOTE = 'Keep a text of what is said nearby, for the AI to read';

export type SheetChange = (row: ListeningRow, change: ListeningSourceChange) => void;

function SheetState({
  row,
  offline,
}: {
  readonly row: ListeningRow;
  readonly offline: boolean;
}): ReactNode {
  const look = lookOf(row.state, offline);
  return (
    <View className="flex-row items-center gap-2">
      <Icon name={look.icon ?? KIND_ICONS[row.source.kind]} size={20} />
      <StateMark mark={look.mark} />
      <Text variant="callout" tone="variant">
        {look.label}
      </Text>
    </View>
  );
}

function wakeNote(row: ListeningRow, name: string): string {
  const paused = row.state === 'privacy' || row.state === 'discord_call';
  return `Listen for “${name}”${paused ? ' · paused for now' : ''}`;
}

interface SwitchProps {
  readonly row: ListeningRow;
  readonly offline: boolean;
  readonly name: string;
  readonly onChange: SheetChange;
}

function FixedSwitches({ row, name }: Pick<SwitchProps, 'row' | 'name'>): ReactNode {
  const { source } = row;
  const fixed = FIXED_NOTE[source.kind];
  return (
    <List>
      <ValueRow
        title="Wake"
        value={source.wake ? 'On' : 'Off'}
        subtitle={fixed ?? wakeNote(row, name)}
      />
      <ValueRow
        title="Write down"
        value={source.transcribe ? 'On' : 'Off'}
        subtitle={fixed ?? WRITE_NOTE}
      />
    </List>
  );
}

function Switches({ row, offline, name, onChange }: SwitchProps): ReactNode {
  if (!switchable(row)) return <FixedSwitches row={row} name={name} />;
  const { source } = row;
  const note = pauseNote(source);
  return (
    <List>
      <SwitchRow
        title="Wake"
        subtitle={wakeNote(row, name)}
        value={source.wake}
        disabled={offline}
        onChange={(value) => {
          onChange(row, { wake: value });
        }}
      />
      <SwitchRow
        title="Write down"
        subtitle={note === null ? WRITE_NOTE : `${note}. Wake still works.`}
        value={source.transcribe}
        disabled={offline}
        onChange={(value) => {
          onChange(row, { transcribe: value });
        }}
      />
    </List>
  );
}

function Sensitivity({
  row,
  offline,
  onChange,
}: {
  readonly row: ListeningRow;
  readonly offline: boolean;
  readonly onChange: SheetChange;
}): ReactNode {
  const { sensitivity } = row.source;
  if (sensitivity === null || !switchable(row)) return null;
  return (
    <View className="gap-1.5">
      <Text variant="footnote" tone="variant">
        How easily it wakes
      </Text>
      <Segmented
        label="Wake sensitivity"
        value={sensitivity}
        disabled={offline}
        options={WAKE_SENSITIVITIES.map((value) => ({
          value,
          label: WAKE_SENSITIVITY_LABELS[value],
        }))}
        onChange={(value) => {
          onChange(row, { sensitivity: value });
        }}
      />
      <Text variant="caption" tone="faint">
        {WAKE_SENSITIVITY_HINTS[sensitivity]}
      </Text>
    </View>
  );
}

function Level({
  row,
  offline,
  onChange,
}: {
  readonly row: ListeningRow;
  readonly offline: boolean;
  readonly onChange: SheetChange;
}): ReactNode {
  const { source } = row;
  const live = row.state === 'listening' && !offline;
  useLevelWatch(source.key, live && METERED.has(source.kind));
  if (!METERED.has(source.kind) || row.state === 'blocked') return null;
  const last = source.claims[0];
  return (
    <View className="gap-4">
      <LevelMeter
        sourceKey={source.key}
        live={live}
        lastWakeDbfs={last === undefined ? null : last.snippetDbfs}
        why={offline ? 'Needs a connection to your hub' : WHY[row.state]}
      />
      <Sensitivity row={row} offline={offline} onChange={onChange} />
    </View>
  );
}

function Body({
  row,
  offline,
  name,
  onChange,
}: {
  readonly row: ListeningRow;
  readonly offline: boolean;
  readonly name: string;
  readonly onChange: SheetChange;
}): ReactNode {
  const { source } = row;
  const blocked = row.state === 'blocked';
  return (
    <View className="gap-4 pb-2">
      <SheetState row={row} offline={offline} />
      <SheetNotice row={row} />
      {source.kind === 'phone' ? (
        <PhoneFixes deviceId={source.key} allowed={row.state !== 'needs_permission'} />
      ) : null}
      {blocked ? null : <Switches row={row} offline={offline} name={name} onChange={onChange} />}
      <Level row={row} offline={offline} onChange={onChange} />
      {blocked ? null : (
        <View className="gap-2.5">
          <Text variant="body-strong">Last wakes here</Text>
          <ClaimList claims={source.claims} name={source.name} />
        </View>
      )}
      {source.kind === 'discord' ? (
        <List>
          <ListRow
            title="Discord plugin settings"
            subtitle="Sensitivity, who is approved, end-of-speech pause"
            icon="puzzle"
            chevron
            href={href.pluginSettings('discord')}
          />
        </List>
      ) : null}
    </View>
  );
}

export function SourceSheet({
  row,
  offline,
  name,
  onClose,
  onChange,
}: {
  readonly row: ListeningRow;
  readonly offline: boolean;
  readonly name: string;
  readonly onClose: () => void;
  readonly onChange: SheetChange;
}): ReactNode {
  return (
    <Sheet
      open
      onClose={onClose}
      title={row.source.name}
      kind="inspector"
      detents={['half', 'full']}
    >
      <Body row={row} offline={offline} name={name} onChange={onChange} />
    </Sheet>
  );
}
