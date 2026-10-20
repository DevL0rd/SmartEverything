import { MAC_ADDRESS, type TelevisionSettingsRow } from '@smarteverything/domain';
import type { TextEditRequest } from '../../../settings/text-edit-sheet';
import type { Tone } from '../../../components/tone';

const MAC_TEXT_LENGTH = 17;

const WHERE_ON_THE_TV =
  'On the TV open Settings, General, Network, Network Status, IP Settings (or About) and copy the MAC address of the network it uses. Also turn on Power On with Mobile under Network, Expert Settings.';

export interface WakeAddressRow {
  readonly value: string;
  readonly subtitle: string;
  readonly tone: Tone;
}

export function wakeAddressOf(row: TelevisionSettingsRow | null): string | null {
  return row?.wake_macs[0]?.toUpperCase() ?? null;
}

export function wakeAddressRow(
  row: TelevisionSettingsRow | null,
  worked: (moment: string) => string,
): WakeAddressRow {
  const address = wakeAddressOf(row);
  if (address === null) {
    return {
      value: 'Not set',
      subtitle: 'Needed to turn the screen on while it is off',
      tone: 'warning',
    };
  }
  const moment = row?.wake_worked_at ?? null;
  return moment === null
    ? { value: address, subtitle: 'The hub has not woken this screen yet', tone: 'variant' }
    : { value: address, subtitle: `Last woke the screen ${worked(moment)}`, tone: 'positive' };
}

export function wakeAddressRequest(
  row: TelevisionSettingsRow | null,
  save: (address: string | null) => Promise<void>,
): TextEditRequest {
  return {
    id: 'wake-address',
    title: 'Wake-on-LAN address',
    label: 'MAC address',
    initial: wakeAddressOf(row) ?? '',
    placeholder: 'AA:BB:CC:DD:EE:FF',
    confirmLabel: 'Save',
    maxLength: MAC_TEXT_LENGTH,
    kind: 'code',
    allowEmpty: true,
    helper: WHERE_ON_THE_TV,
    problemOf: (value) =>
      MAC_ADDRESS.safeParse(value).success
        ? null
        : 'Use six pairs of digits, like AA:BB:CC:DD:EE:FF',
    save: (value) => save(value === '' ? null : MAC_ADDRESS.parse(value)),
  };
}
