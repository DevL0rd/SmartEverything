import type { ReactNode } from 'react';
import { Image, View, type ViewStyle } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { hoursMinutes } from '../../../format/time';
import { useRow } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { usePhoneSection } from '../data/phone-detail';
import { usePhoneIcon } from '../data/phone-icons';
import { usePhoneFace } from '../card/use-phone-face';
import { topAppsOf, type TopApp } from '../model/top-apps';

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
      className="min-h-9 flex-row items-center gap-2.5"
    >
      <AppIcon app={app} />
      <Text variant="callout" numberOfLines={1} className="min-w-0 flex-1">
        {app.label}
      </Text>
      <View aria-hidden className="h-1 w-16 flex-row overflow-hidden rounded-full bg-surface-3">
        <View style={shareStyle(app.share)} className="rounded-full bg-viz-1" />
        <View style={shareStyle(1 - app.share)} />
      </View>
      <Text variant="callout" tone="variant" className="tabular w-16 text-right">
        {hoursMinutes(app.minutes)}
      </Text>
    </View>
  );
}

function OwnApps({ device }: { readonly device: Device }): ReactNode {
  const apps = topAppsOf(usePhoneSection(device.id, 'apps'));
  return (
    <Card
      title="Top apps today"
      icon="grid"
      action={
        <Button label="All apps" variant="text" href={href.settings.device(device.id, 'apps')} />
      }
    >
      {apps.length === 0 ? (
        <Text variant="callout" tone="variant">
          No app time recorded yet. App usage access may be off on the phone.
        </Text>
      ) : (
        apps.map((app) => <AppRow key={app.package} app={app} />)
      )}
    </Card>
  );
}

function LockedApps({ device }: { readonly device: Device }): ReactNode {
  const profileId = device.details['profileId'];
  const person = useRow('profiles', typeof profileId === 'string' ? profileId : null)?.name;
  return (
    <Card title="Apps" icon="grid">
      <View className="flex-row items-start gap-2">
        <Icon name="lock" size={16} tone="variant" />
        <Text variant="footnote" tone="variant" className="min-w-0 flex-1">
          {`App names and notification titles stay with ${person ?? 'the phone’s person'}. You see counts and totals.`}
        </Text>
      </View>
    </Card>
  );
}

export function AppsCard({ device }: { readonly device: Device }): ReactNode {
  const { access } = usePhoneFace(device);
  return access.view.own ? <OwnApps device={device} /> : <LockedApps device={device} />;
}
