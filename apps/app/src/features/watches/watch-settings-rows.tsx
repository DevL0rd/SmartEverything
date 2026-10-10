import type { ReactNode } from 'react';
import { useState } from 'react';
import type { WatchActionRequest, WatchGoal, WatchSetting } from '@smarteverything/domain';
import type { IconName } from '../../components/icon';
import { ListRow } from '../../components/list-row';
import { SelectRow, SwitchRow, ValueRow } from '../../components/rows';
import { List } from '../../components/section';
import type { WatchCommand } from './watch-config';
import { WatchGoalRows } from './watch-goal-rows';
import { TimeSheet, timeLabel } from './watch-time';

const ICONS: readonly (readonly [string, IconName])[] = [
  ['heart.', 'heartPulse'],
  ['spo2.', 'droplet'],
  ['stress.', 'brain'],
  ['standing.', 'personStanding'],
  ['goals.', 'trophy'],
  ['vitality.', 'sparkles'],
  ['sleep_mode.', 'moon'],
];

const NEEDS: Readonly<Record<string, readonly string[]>> = {
  'standing.start': ['standing.enabled'],
  'standing.end': ['standing.enabled'],
  'standing.quiet': ['standing.enabled'],
  'standing.quiet_start': ['standing.enabled', 'standing.quiet'],
  'standing.quiet_end': ['standing.enabled', 'standing.quiet'],
  'sleep_mode.start': ['sleep_mode.enabled'],
  'sleep_mode.end': ['sleep_mode.enabled'],
};

const RANGES = [
  { start: 'standing.quiet_start', end: 'standing.quiet_end', label: 'Break' },
] as const;

function iconOf(key: string): IconName {
  return ICONS.find(([prefix]) => key.startsWith(prefix))?.[1] ?? 'settings';
}

function shown(setting: WatchSetting, all: readonly WatchSetting[]): boolean {
  return (NEEDS[setting.key] ?? []).every((key) =>
    all.some((other) => other.key === key && other.kind === 'switch' && other.value),
  );
}

type TimeSetting = Extract<WatchSetting, { kind: 'time' }>;

function TimeRow({
  title,
  settings,
  command,
}: {
  readonly title: string;
  readonly settings: readonly TimeSetting[];
  readonly command: WatchCommand;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const first = settings[0];
  if (first === undefined) {
    return null;
  }
  return (
    <>
      <ListRow
        title={title}
        value={settings.map((setting) => timeLabel(setting.value)).join(' – ')}
        icon={iconOf(first.key)}
        chevron
        disabled={command.busy}
        onPress={() => {
          setOpen(true);
        }}
      />
      {open ? (
        <TimeSheet
          title={title}
          fields={settings.map((setting) => ({ label: setting.label, value: setting.value }))}
          onClose={() => {
            setOpen(false);
          }}
          onSave={(values) => {
            command.run(
              ...settings.flatMap((setting, index): WatchActionRequest[] => {
                const value = values[index];
                return value === undefined || value === setting.value
                  ? []
                  : [{ type: 'set_setting', key: setting.key, value }];
              }),
            );
          }}
        />
      ) : null}
    </>
  );
}

function SettingRow({
  setting,
  command,
}: {
  readonly setting: WatchSetting;
  readonly command: WatchCommand;
}): ReactNode {
  const icon = iconOf(setting.key);
  const change = (value: boolean | string): void => {
    command.run({ type: 'set_setting', key: setting.key, value });
  };
  switch (setting.kind) {
    case 'switch':
      return (
        <SwitchRow
          title={setting.label}
          icon={icon}
          {...(setting.description === null ? {} : { subtitle: setting.description })}
          value={setting.value}
          disabled={command.busy}
          onChange={change}
        />
      );
    case 'choice':
      return (
        <SelectRow
          title={setting.label}
          icon={icon}
          options={setting.options.map((option) => ({
            ...option,
            label: option.label.replace(/ %/g, '%'),
          }))}
          value={setting.value}
          disabled={command.busy}
          onChange={change}
        />
      );
    case 'time':
      return <TimeRow title={setting.label} settings={[setting]} command={command} />;
    case 'number':
      return (
        <ValueRow
          title={setting.label}
          icon={icon}
          value={`${String(setting.value)}${setting.unit ?? ''}`}
        />
      );
  }
}

function SectionRows({
  settings,
  all,
  command,
}: {
  readonly settings: readonly WatchSetting[];
  readonly all: readonly WatchSetting[];
  readonly command: WatchCommand;
}): ReactNode {
  const visible = settings.filter((setting) => shown(setting, all));
  const ranged = new Set<string>(RANGES.flatMap((range) => [range.start, range.end]));
  return (
    <>
      {visible.map((setting) => {
        const range = RANGES.find((candidate) => candidate.start === setting.key);
        if (range !== undefined) {
          const parts = visible.filter(
            (other): other is TimeSetting =>
              other.kind === 'time' && (other.key === range.start || other.key === range.end),
          );
          return (
            <TimeRow key={setting.key} title={range.label} settings={parts} command={command} />
          );
        }
        return ranged.has(setting.key) ? null : (
          <SettingRow key={setting.key} setting={setting} command={command} />
        );
      })}
    </>
  );
}

const GOALS_SECTION = 'Goals';

export function WatchSettingSections({
  settings,
  goals,
  command,
}: {
  readonly settings: readonly WatchSetting[];
  readonly goals: readonly WatchGoal[];
  readonly command: WatchCommand;
}): ReactNode {
  const sections = [
    ...new Set([
      ...settings.map((setting) => setting.section),
      ...(goals.length === 0 ? [] : [GOALS_SECTION]),
    ]),
  ];
  return (
    <>
      {sections.map((section) => (
        <List key={section} inset title={section}>
          {section === GOALS_SECTION && goals.length > 0 ? <WatchGoalRows goals={goals} /> : null}
          <SectionRows
            settings={settings.filter((setting) => setting.section === section)}
            all={settings}
            command={command}
          />
        </List>
      ))}
    </>
  );
}
