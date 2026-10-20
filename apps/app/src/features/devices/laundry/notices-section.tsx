import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  DEFAULT_LAUNDRY_NOTICE,
  LAUNDRY_NOTICE_WORDING,
  type LaundryNoticeChange,
  type LaundryNoticeKind,
  type LaundryNoticeSetting,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { updateLaundryNotices } from '../../../api/devices';
import { Card } from '../../../components/card';
import type { IconName } from '../../../components/icon';
import { IconWell } from '../../../components/icon-well';
import { SelectRow, SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Switch } from '../../../components/switch';
import { Text } from '../../../components/text';
import { notifyFailure } from '../../../components/toast-store';
import { useStoreSelector } from '../../../store/store-context';
import type { Device } from '../../../store/state';
import { useDeviceModel } from '../model/device-model';
import { noticeKindsOf, unloadOptions } from './notice-model';
import type { Laundry } from './use-laundry';

const NOTICE_ICONS: Readonly<Record<LaundryNoticeKind, IconName>> = {
  finished: 'check',
  fault: 'warning',
  detergent: 'droplet',
  softener: 'sparkles',
  filter: 'filter',
  unload: 'doorOpen',
};

function change(deviceId: string, next: LaundryNoticeChange): void {
  background(
    updateLaundryNotices(deviceId, next).then(
      () => undefined,
      notifyFailure('The notice setting didn’t save'),
    ),
    'device.laundry_notices_failed',
  );
}

function useNoticeSetting(deviceId: string): LaundryNoticeSetting {
  return useStoreSelector(
    (state) => state.settings?.laundry_notices[deviceId] ?? DEFAULT_LAUNDRY_NOTICE,
    Object.is,
    [deviceId],
  );
}

export function LaundryNoticesSection({ device }: { readonly device: Device }): ReactNode {
  const kinds = noticeKindsOf(useDeviceModel(device).presentation);
  const setting = useNoticeSetting(device.id);
  if (kinds.length === 0) {
    return null;
  }
  const unloadOn = kinds.includes('unload') && !setting.off.includes('unload');
  return (
    <List
      title="Notifications"
      footer="Sent to the phones of everyone in the home whose alerts for this machine are on."
    >
      {kinds.map((kind) => (
        <SwitchRow
          key={kind}
          title={LAUNDRY_NOTICE_WORDING[kind].label}
          icon={NOTICE_ICONS[kind]}
          value={!setting.off.includes(kind)}
          onChange={(on) => {
            change(device.id, { on: { [kind]: on } });
          }}
        />
      ))}
      {unloadOn ? (
        <SelectRow
          title="Unload reminder"
          subtitle="When the door stays shut after a finished cycle"
          icon="timer"
          options={unloadOptions(setting.unloadMinutes)}
          value={String(setting.unloadMinutes)}
          onChange={(minutes) => {
            change(device.id, { unloadMinutes: Number(minutes) });
          }}
        />
      ) : null}
    </List>
  );
}

function CardRow({
  deviceId,
  kind,
  on,
}: {
  readonly deviceId: string;
  readonly kind: LaundryNoticeKind;
  readonly on: boolean;
}): ReactNode {
  const label = LAUNDRY_NOTICE_WORDING[kind].label;
  return (
    <View className="min-h-touch-min flex-row items-center gap-3">
      <IconWell icon={on ? 'bell' : 'bellOff'} colour={on ? 'primary' : 'on-surface-variant'} />
      <Text variant="body" numberOfLines={1} className="min-w-0 flex-1">
        {label}
      </Text>
      <Switch
        label={`Notify me: ${label}`}
        value={on}
        onChange={(next) => {
          change(deviceId, { on: { [kind]: next } });
        }}
      />
    </View>
  );
}

export function NotifyCard({ laundry }: { readonly laundry: Laundry }): ReactNode {
  const { device } = laundry;
  const kinds = noticeKindsOf(laundry.presentation);
  const setting = useNoticeSetting(device.id);
  if (kinds.length === 0) {
    return null;
  }
  return (
    <Card title="Notify me">
      <View className="gap-2">
        {kinds.map((kind) => (
          <CardRow key={kind} deviceId={device.id} kind={kind} on={!setting.off.includes(kind)} />
        ))}
        <Text variant="footnote" tone="variant">
          Sends a notice to the phones in your home. Set the unload reminder time in the machine’s
          settings.
        </Text>
      </View>
    </Card>
  );
}
