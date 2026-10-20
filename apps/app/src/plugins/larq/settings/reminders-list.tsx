import { BOTTLE_COLOURS, type BottleSettingsView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { ListRow } from '../../../components/list-row';
import { SelectRow, SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Segmented } from '../../../components/segmented';
import { Text } from '../../../components/text';
import { useBottleAct } from '../data/bottle-act';
import {
  INTERVALS,
  hexOfSwatch,
  quietLine,
  reminderLine,
  swatchOfHex,
  windowText,
  type Window,
} from '../model/settings-model';
import { Anchored } from './anchored';
import { ClockStepper } from './clock-stepper';
import { ReminderSwatches } from './reminder-swatches';
import { WindowDial, type DialWindow } from './window-dial';

const DIAL = 232;

const QUIET_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: 'on', label: 'On' },
  { value: 'auto', label: 'Auto' },
] as const;

const EDITING = [
  { value: 'reminder', label: 'Reminders' },
  { value: 'quiet', label: 'Quiet hours' },
] as const;

type Editing = (typeof EDITING)[number]['value'];

interface Props {
  readonly view: BottleSettingsView;
}

function windowsOf(view: BottleSettingsView): readonly DialWindow[] {
  return [
    { window: view.reminder, role: 'info', label: 'Reminders' },
    { window: view.quiet, role: 'viz-violet', label: 'Quiet hours' },
  ];
}

function Steppers({
  view,
  active,
  commit,
}: Props & {
  readonly active: Window | null;
  readonly commit: (window: Window) => void;
}): ReactNode {
  if (active === null) {
    return (
      <Text variant="footnote" tone="variant">
        The bottle has not reported these times yet.
      </Text>
    );
  }
  return (
    <View className="w-full">
      <ClockStepper
        label="Starts"
        value={active.from}
        disabled={!view.mayEdit}
        onChange={(from) => {
          commit({ from, to: active.to });
        }}
      />
      <ClockStepper
        label="Ends"
        value={active.to}
        disabled={!view.mayEdit}
        onChange={(to) => {
          commit({ from: active.from, to });
        }}
      />
    </View>
  );
}

function Dial({ view }: Props): ReactNode {
  const { act } = useBottleAct(view.deviceId);
  const [editing, setEditing] = useState<Editing>('reminder');
  const index = editing === 'reminder' ? 0 : 1;
  const active = windowsOf(view)[index]?.window ?? null;
  const commit = (window: Window): void => {
    act(
      editing === 'reminder'
        ? { action: 'set_reminder', reminder: window }
        : { action: 'set_quiet_hours', quiet: window },
      'Could not save the times',
    );
  };
  return (
    <View className="items-center gap-3 px-4 py-3">
      <Segmented
        label="Window to edit"
        options={EDITING}
        value={editing}
        fill
        onChange={setEditing}
      />
      <WindowDial size={DIAL} windows={windowsOf(view)} editing={index} onCommit={commit} />
      <Steppers view={view} active={active} commit={commit} />
    </View>
  );
}

function IntervalRow({ view }: Props): ReactNode {
  const { act } = useBottleAct(view.deviceId);
  const reminder = view.reminder;
  if (reminder === null) {
    return null;
  }
  return (
    <Anchored deviceId={view.deviceId} id="reminder-interval" label="Remind every">
      <SelectRow
        icon="timer"
        title="Remind every"
        options={INTERVALS.map((minutes) => ({
          value: String(minutes),
          label: `${String(minutes)} min`,
        }))}
        value={String(reminder.intervalMin)}
        disabled={!view.mayEdit || reminder.state === 'off'}
        onChange={(value) => {
          act(
            { action: 'set_reminder', reminder: { intervalMin: Number(value) } },
            'Could not save the interval',
          );
        }}
      />
    </Anchored>
  );
}

function ColourRow({ view }: Props): ReactNode {
  const { act } = useBottleAct(view.deviceId);
  const reminder = view.reminder;
  if (reminder === null) {
    return null;
  }
  const chosen = swatchOfHex(reminder.colour);
  return (
    <Anchored deviceId={view.deviceId} id="reminder-colour" label="Reminder colour">
      <ListRow
        icon="palette"
        title="Reminder colour"
        subtitle={BOTTLE_COLOURS.find((colour) => colour.id === chosen)?.label ?? 'White'}
      />
      <View className="px-4 pb-3">
        <ReminderSwatches
          value={chosen}
          disabled={!view.mayEdit}
          onChange={(id) => {
            act(
              { action: 'set_reminder', reminder: { colour: hexOfSwatch(id) } },
              'Could not save the colour',
            );
          }}
        />
      </View>
    </Anchored>
  );
}

function QuietRow({ view }: Props): ReactNode {
  const { act } = useBottleAct(view.deviceId);
  const state =
    view.quiet?.state === 'on' || view.quiet?.state === 'auto' ? view.quiet.state : 'off';
  return (
    <Anchored deviceId={view.deviceId} id="quiet-hours" label="Quiet hours">
      <View className="gap-2 px-4 py-3">
        <Text variant="body">Quiet hours</Text>
        <Text variant="footnote" tone="variant">
          {quietLine(view.quiet)}
        </Text>
        <Segmented
          label="Quiet hours"
          options={QUIET_OPTIONS}
          value={state}
          fill
          onChange={(next) => {
            act(
              { action: 'set_quiet_hours', quiet: { state: next } },
              'Could not save quiet hours',
            );
          }}
        />
        {view.quiet === null ? null : (
          <Text variant="caption" tone="faint">{`Quiet window ${windowText(view.quiet)}`}</Text>
        )}
      </View>
    </Anchored>
  );
}

export function RemindersList({ view }: Props): ReactNode {
  const { act } = useBottleAct(view.deviceId);
  const reminder = view.reminder;
  const pending = view.pending.reminder !== null || view.pending.quiet !== null;
  return (
    <List
      inset
      title="Drink reminders"
      footer={`The cap flashes its ring in the colour you pick. Quiet hours keep it dark.${pending ? ' Applies when the bottle wakes.' : ''}`}
    >
      <Anchored deviceId={view.deviceId} id="reminders" label="Drink reminders">
        <SwitchRow
          icon="bell"
          title="Drink reminders"
          subtitle={reminderLine(reminder)}
          value={reminder !== null && reminder.state !== 'off'}
          disabled={!view.mayEdit || reminder === null}
          onChange={(on) => {
            act(
              { action: 'set_reminder', reminder: { state: on ? 'interval_fixed' : 'off' } },
              'Could not save the reminder',
            );
          }}
        />
      </Anchored>
      <Dial view={view} />
      <IntervalRow view={view} />
      <ColourRow view={view} />
      <QuietRow view={view} />
    </List>
  );
}
