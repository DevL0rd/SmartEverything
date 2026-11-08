import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DevicePresentation } from '@smarteverything/domain';
import { List } from '../../../../components/section';
import type { Device } from '../../../../store/state';
import { CapabilityRow } from '../../controls/capability-row';
import { offlineReason } from '../../controls/guard';
import { useDeviceModel } from '../../model/device-model';
import { useDisplayName } from '../../model/display-name';
import { presentedRows } from '../model/presented-refs';
import { CLEAN_MORE_REFS, CLEAN_PRESET_REFS, CUSTOM_CLEANUP_REFS } from '../page-homes';
import { SettingRow } from './settings';

export const CLEAN_LISTS = [
  {
    id: 'presets',
    title: 'Presets',
    footer: null,
    refs: CLEAN_PRESET_REFS,
  },
  {
    id: 'custom',
    title: 'Custom cleanups',
    footer: 'Saved cleanups from Xiaomi Home, up to 5.',
    refs: CUSTOM_CLEANUP_REFS,
  },
  {
    id: 'more',
    title: 'More ways to clean',
    footer: 'Spot cleaning, furniture and objects, or changes to the clean that is running.',
    refs: CLEAN_MORE_REFS,
  },
] as const;

function CleanList({
  device,
  presentation,
  list,
  reason,
}: {
  readonly device: Device;
  readonly presentation: DevicePresentation;
  readonly list: (typeof CLEAN_LISTS)[number];
  readonly reason: string | null;
}): ReactNode {
  const rows = presentedRows(presentation, list.refs);
  if (rows.length === 0) {
    return null;
  }
  return (
    <List title={list.title} {...(list.footer === null ? {} : { footer: list.footer })}>
      {rows.map((presented) =>
        presented.capability.value.kind === 'action' ? (
          <CapabilityRow
            key={presented.key}
            device={device}
            presented={presented}
            reason={reason}
          />
        ) : (
          <SettingRow
            key={presented.key}
            device={device}
            presentation={presentation}
            presented={presented}
            reason={reason}
          />
        ),
      )}
    </List>
  );
}

export type CleanListId = (typeof CLEAN_LISTS)[number]['id'];

export function VacuumCleanLists({
  device,
  only,
}: {
  readonly device: Device;
  readonly only: readonly CleanListId[];
}): ReactNode {
  const { presentation } = useDeviceModel(device);
  const name = useDisplayName(device.id);
  const reason = device.online ? null : offlineReason(name);
  return (
    <View className="gap-section-gap">
      {CLEAN_LISTS.filter((list) => only.includes(list.id)).map((list) => (
        <CleanList
          key={list.id}
          device={device}
          presentation={presentation}
          list={list}
          reason={reason}
        />
      ))}
    </View>
  );
}
