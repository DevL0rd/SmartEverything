import { memo, type ReactNode } from 'react';
import { Image, View, type ViewStyle } from 'react-native';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { hoursMinutes } from '../../../format/time';
import { useRow } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { usePhoneSection } from '../data/phone-detail';
import { usePhoneIcon } from '../data/phone-icons';
import { topAppsOf, type TopApp } from '../model/top-apps';
import { MiniBars } from './card-parts';
import type { PhoneAccess } from '../model/face-model';

function Initial({ label }: { readonly label: string }): ReactNode {
  return (
    <View className="size-6 items-center justify-center rounded-sm bg-surface-3">
      <Text variant="caption" tone="variant">
        {label.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

function AppIcon({ app }: { readonly app: TopApp }): ReactNode {
  const uri = usePhoneIcon(app.iconHash);
  return uri === null ? (
    <Initial label={app.label} />
  ) : (
    <Image source={{ uri }} accessibilityLabel={app.label} className="size-6 rounded-sm" />
  );
}

function shareStyle(share: number): ViewStyle {
  return { flexGrow: share, flexBasis: 0 };
}

function AppRow({ app }: { readonly app: TopApp }): ReactNode {
  return (
    <View
      accessible
      accessibilityLabel={`${app.label}, ${hoursMinutes(app.minutes)} today`}
      className="min-h-8 flex-row items-center gap-2"
    >
      <AppIcon app={app} />
      <Text variant="callout" numberOfLines={1} className="min-w-0 flex-1">
        {app.label}
      </Text>
      <View aria-hidden className="h-1 w-14 flex-row overflow-hidden rounded-full bg-surface-3">
        <View style={shareStyle(app.share)} className="rounded-full bg-viz-1" />
        <View style={shareStyle(1 - app.share)} />
      </View>
      <Text variant="callout" tone="variant" className="tabular w-14 text-right">
        {hoursMinutes(app.minutes)}
      </Text>
    </View>
  );
}

function TopApps({ deviceId }: { readonly deviceId: string }): ReactNode {
  const apps = topAppsOf(usePhoneSection(deviceId, 'apps'));
  if (apps.length === 0) return null;
  return (
    <View className="gap-0.5">
      <Text variant="label" tone="variant">
        TOP APPS TODAY
      </Text>
      {apps.map((app) => (
        <AppRow key={app.package} app={app} />
      ))}
    </View>
  );
}

function NotificationsLine({
  deviceId,
  count,
}: {
  readonly deviceId: string;
  readonly count: number;
}): ReactNode {
  const first = usePhoneSection(deviceId, 'notifications')?.apps[0]?.label;
  const text = `${String(count)} ${count === 1 ? 'notification' : 'notifications'}`;
  return (
    <View className="min-h-8 flex-row items-center gap-2">
      <Icon name="bell" size={16} tone="variant" />
      <Text variant="callout" numberOfLines={1} className="min-w-0 flex-1">
        {first === undefined ? text : `${text} · ${first}`}
      </Text>
    </View>
  );
}

function Totals({
  deviceId,
  minutes,
}: {
  readonly deviceId: string;
  readonly minutes: number | null;
}): ReactNode {
  const week = usePhoneSection(deviceId, 'screen')?.usage?.screenMinutesByDay;
  if (minutes === null) return null;
  return (
    <View className="gap-1.5">
      <Text variant="label" tone="variant">
        SCREEN TIME TODAY
      </Text>
      <View className="flex-row items-center gap-3">
        <Text variant="title-3" className="tabular">
          {hoursMinutes(minutes)}
        </Text>
        {week === undefined ? null : (
          <View className="min-w-0 flex-1">
            <MiniBars values={week.map((day) => day.minutes)} height={24} />
          </View>
        )}
      </View>
    </View>
  );
}

function LockLine({ device }: { readonly device: Device }): ReactNode {
  const profileId = device.details['profileId'];
  const person = useRow('profiles', typeof profileId === 'string' ? profileId : null)?.name;
  return (
    <View className="flex-row items-start gap-2 rounded-md border-hairline border-outline-variant bg-surface-2 px-3 py-2.5">
      <Icon name="lock" size={16} tone="variant" />
      <Text variant="footnote" tone="variant" className="min-w-0 flex-1">
        {`Apps and notifications stay with ${person ?? 'its person'}`}
      </Text>
    </View>
  );
}

export const XlColumn = memo(function XlColumn({
  device,
  access,
  notificationCount,
  screenMinutes,
}: {
  readonly device: Device;
  readonly access: PhoneAccess;
  readonly notificationCount: number | null;
  readonly screenMinutes: number | null;
}): ReactNode {
  return (
    <View className="w-64 shrink gap-2.5 medium:w-80" pointerEvents="none">
      {access.view.own ? (
        <>
          <TopApps deviceId={device.id} />
          {notificationCount === null ? null : (
            <NotificationsLine deviceId={device.id} count={notificationCount} />
          )}
        </>
      ) : (
        <>
          <Totals deviceId={device.id} minutes={screenMinutes} />
          <LockLine device={device} />
        </>
      )}
    </View>
  );
});
