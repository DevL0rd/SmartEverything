import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { PhoneSettingsPage } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { ReasonLine } from '../../../components/reason-line';
import { SwitchTrack } from '../../../components/switch';
import { Text } from '../../../components/text';
import { selectionTick } from '../../../platform/haptics';
import { useControl } from '../../../store/control';
import { sameJson } from '../../../store/same-json';
import { useDeviceDerived } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { usePhoneAction } from '../data/phone-action';
import { phoneReadingsOf } from '../phone-values';
import { LockLine } from '../screens/detail-parts';
import {
  NEEDS_SETTINGS,
  RADIO_ROWS,
  TOGGLE_ROWS,
  radioSpoken,
  radioStateOf,
  type RadioRow,
  type ToggleRow,
} from './system-model';

function ToggleLine({
  device,
  row,
  value,
  disabled,
}: {
  readonly device: Device;
  readonly row: ToggleRow;
  readonly value: boolean | null;
  readonly disabled: boolean;
}): ReactNode {
  const control = useControl(device.id, row.capability);
  const shown = control.pending && typeof control.value === 'boolean' ? control.value : value;
  return (
    <Interactive
      role="switch"
      label={row.label}
      checked={shown === true}
      disabled={disabled || shown === null}
      onPress={() => {
        selectionTick();
        background(control.set(shown !== true), `phone.${row.capability}_failed`);
      }}
      className="min-h-touch-min flex-row items-center gap-3"
    >
      <Icon name={row.icon} size={20} tone="variant" />
      <Text variant="body" className="flex-1">
        {row.label}
      </Text>
      <SwitchTrack value={shown === true} />
    </Interactive>
  );
}

function RadioLine({
  row,
  on,
  open,
}: {
  readonly row: RadioRow;
  readonly on: boolean | null;
  readonly open: (() => void) | null;
}): ReactNode {
  const state = radioStateOf(on);
  return (
    <View
      accessibilityLabel={radioSpoken(row, on)}
      className="min-h-touch-min flex-row items-center gap-3"
    >
      <Icon name={row.icon} size={20} tone="variant" />
      <Text variant="body" className="flex-1" numberOfLines={1}>
        {row.label}
      </Text>
      {state === null ? null : <Badge label={state.label} tone={state.tone} />}
      {open === null ? null : (
        <Button label="Settings" variant="text" icon="externalLink" onPress={open} />
      )}
    </View>
  );
}

function useOpenSettings(
  device: Device,
  own: boolean,
): (page: PhoneSettingsPage) => (() => void) | null {
  const run = usePhoneAction(device);
  return (page) =>
    own
      ? (): void => {
          run({ type: 'open_settings', page });
        }
      : null;
}

function NeedSettingsLine({ open }: { readonly open: (() => void) | null }): ReactNode {
  return (
    <ReasonLine
      icon="warning"
      tone="warning"
      text={NEEDS_SETTINGS}
      {...(open === null ? {} : { action: { label: 'Open settings', onPress: open } })}
    />
  );
}

export function SystemTogglesCard({
  device,
  writable,
  canAct,
  own,
  person,
}: {
  readonly device: Device;
  readonly writable: boolean;
  readonly canAct: boolean;
  readonly own: boolean;
  readonly person: string;
}): ReactNode {
  const readings = useDeviceDerived(device.id, phoneReadingsOf, [], sameJson);
  const opener = useOpenSettings(device, own);
  return (
    <Card title="System" icon="settings">
      {TOGGLE_ROWS.map((row) => (
        <ToggleLine
          key={row.capability}
          device={device}
          row={row}
          value={row.reading(readings)}
          disabled={!canAct || !writable}
        />
      ))}
      <View className="h-hairline bg-outline-variant" />
      {RADIO_ROWS.map((row) => (
        <RadioLine key={row.key} row={row} on={row.reading(readings)} open={opener(row.page)} />
      ))}
      {writable ? null : <NeedSettingsLine open={opener('write_settings')} />}
      {canAct ? null : <LockLine text={`Only ${person} and the owner can change these`} />}
    </Card>
  );
}
