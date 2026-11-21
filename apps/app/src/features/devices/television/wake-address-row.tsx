import { useState, type ReactNode } from 'react';
import type { TelevisionSettingsRow } from '@smarteverything/domain';
import { updateDevice } from '../../../api/devices';
import type { EntityStore } from '../../../store/entity-store';
import { liveRowEdit, writeOptimistically } from '../../../store/optimistic';
import { useEntityStore } from '../../../store/store-context';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { TextEditSheet, type TextEditRequest } from '../../../settings/text-edit-sheet';
import { wakeAddressRequest, wakeAddressRow, withWakeAddress } from './wake-address';

function workedText(moment: string): string {
  return new Date(moment).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

async function saveWakeAddress(
  store: EntityStore,
  deviceId: string,
  address: string | null,
): Promise<void> {
  const before = store.get().tables.television_settings.byId[deviceId] ?? null;
  const after = withWakeAddress(deviceId, before, address);
  await writeOptimistically(store, {
    event: 'television.wake_address',
    edits: [liveRowEdit('television_settings', deviceId, before, after)],
    send: () => updateDevice(deviceId, { wake_address: address }),
    fields: { deviceId },
  });
}

export function WakeAddressRow({
  deviceId,
  settings,
}: {
  readonly deviceId: string;
  readonly settings: TelevisionSettingsRow | null;
}): ReactNode {
  const [request, setRequest] = useState<TextEditRequest | null>(null);
  const store = useEntityStore();
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
            wakeAddressRequest(settings, (address) => saveWakeAddress(store, deviceId, address)),
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
