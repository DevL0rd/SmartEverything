import { useState, type ReactNode } from 'react';
import type { TelevisionSettingsRow } from '@smarteverything/domain';
import { updateDevice } from '../../../api/devices';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { TextEditSheet, type TextEditRequest } from '../../../settings/text-edit-sheet';
import { wakeAddressRequest, wakeAddressRow } from './wake-address';

function workedText(moment: string): string {
  return new Date(moment).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function WakeAddressRow({
  deviceId,
  settings,
}: {
  readonly deviceId: string;
  readonly settings: TelevisionSettingsRow | null;
}): ReactNode {
  const [request, setRequest] = useState<TextEditRequest | null>(null);
  const row = wakeAddressRow(settings, workedText);
  return (
    <List title="Turning on without a direct link">
      <ListRow
        title="Wake-on-LAN address"
        subtitle={row.subtitle}
        subtitleTone={row.tone}
        wrapSubtitle
        icon="power"
        value={row.value}
        chevron
        onPress={() => {
          setRequest(
            wakeAddressRequest(settings, (address) =>
              updateDevice(deviceId, { wake_address: address }),
            ),
          );
        }}
      />
      <TextEditSheet
        request={request}
        onClose={() => {
          setRequest(null);
        }}
      />
    </List>
  );
}
