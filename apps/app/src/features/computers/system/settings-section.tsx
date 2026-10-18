import type { ReactNode } from 'react';
import type { ComputerParts, SystemState } from '@smarteverything/domain';
import { Card } from '../../../components/card';
import { SelectRow, SwitchRow } from '../../../components/rows';
import { Segmented } from '../../../components/segmented';
import { List, Section } from '../../../components/section';
import { sameJson } from '../../../store/same-json';
import { useComputerSelect } from '../data/computer-metrics';
import { useSystemChange } from '../data/computer-system';
import { powerModeOptions } from './system-model';

type Settings = Pick<SystemState, 'powerMode' | 'dnd' | 'keyboard'>;

function settingsOf(parts: ComputerParts): Settings | null {
  const system = parts.system;
  return system === undefined
    ? null
    : { powerMode: system.powerMode, dnd: system.dnd, keyboard: system.keyboard };
}

function PowerMode({
  mode,
  disabled,
  deviceId,
}: {
  readonly mode: NonNullable<Settings['powerMode']>;
  readonly disabled: boolean;
  readonly deviceId: string;
}): ReactNode {
  const change = useSystemChange(deviceId);
  return (
    <Section title="Power mode">
      <Card>
        <Segmented
          label="Power mode"
          value={mode.current}
          options={powerModeOptions(mode.offered)}
          disabled={disabled || change.isPending}
          onChange={(next) => {
            change.mutate({ action: 'power_mode', mode: next });
          }}
        />
      </Card>
    </Section>
  );
}

function General({
  settings,
  disabled,
  deviceId,
}: {
  readonly settings: Settings;
  readonly disabled: boolean;
  readonly deviceId: string;
}): ReactNode {
  const change = useSystemChange(deviceId);
  const { dnd, keyboard } = settings;
  const blocked = disabled || change.isPending;
  return (
    <List title="Settings">
      {dnd === null ? null : (
        <SwitchRow
          title="Do Not Disturb"
          subtitle="Hides pop-up notices on the computer"
          value={dnd}
          disabled={blocked}
          onChange={(enabled) => {
            change.mutate({ action: 'dnd', enabled });
          }}
        />
      )}
      {keyboard === null ? null : (
        <SelectRow
          title="Keyboard layout"
          options={keyboard.layouts.map((layout) => ({ value: layout.id, label: layout.name }))}
          value={keyboard.current}
          disabled={blocked}
          onChange={(layout) => {
            change.mutate({ action: 'keyboard_layout', layout });
          }}
        />
      )}
    </List>
  );
}

export function SettingsSection({
  deviceId,
  offline,
}: {
  readonly deviceId: string;
  readonly offline: boolean;
}): ReactNode {
  const settings = useComputerSelect(deviceId, settingsOf, sameJson);
  if (settings === null) return null;
  return (
    <>
      {settings.powerMode === null ? null : (
        <PowerMode mode={settings.powerMode} disabled={offline} deviceId={deviceId} />
      )}
      {settings.dnd === null && settings.keyboard === null ? null : (
        <General settings={settings} disabled={offline} deviceId={deviceId} />
      )}
    </>
  );
}
