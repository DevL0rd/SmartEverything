import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { PhoneDetail } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { useSectionParam } from '../../../components/use-section-param';
import { useRow } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { usePhoneView } from '../components/use-phone-view';
import { usePhoneSection } from '../data/phone-detail';
import { DetailSectionGate } from '../components/detail-section-gate';
import { PermissionNeed } from '../components/permission-need';
import { PhoneCardGrid } from '../frame/phone-grid';
import { featuresOf, featureState } from '../model/face-model';
import { pageAccessOf } from '../model/page-access';
import { appRowsOf, todayAppsOf, type AppRow } from '../model/apps-model';
import { AppSheet } from './app-sheet';
import { AppsList } from './apps-list';
import { AppsToday } from './apps-today';
import { AppsTotals } from './apps-totals';
import { AppsWeek } from './apps-week';

type AppsSection = NonNullable<PhoneDetail['apps']>;

function usePersonName(device: Device): string {
  const profileId = device.details['profileId'];
  return (
    useRow('profiles', typeof profileId === 'string' ? profileId : null)?.name ?? 'this person'
  );
}

function useNotificationCounts(deviceId: string): (app: string) => number {
  const section = usePhoneSection(deviceId, 'notifications');
  return (app) => section?.apps.find((entry) => entry.package === app)?.count ?? 0;
}

function useAppBytes(deviceId: string): (app: string) => number | null {
  const section = usePhoneSection(deviceId, 'storage');
  return (app) => section?.apps.find((entry) => entry.package === app)?.bytes ?? null;
}

function weekMinutesOf(screen: PhoneDetail['screen']): readonly number[] | null {
  return screen?.usage?.screenMinutesByDay.map((day) => day.minutes) ?? null;
}

function OwnCards({
  rows,
  front,
  minutes,
}: {
  readonly rows: readonly AppRow[];
  readonly front: string | null;
  readonly minutes: readonly number[] | null;
}): ReactNode {
  const cards = [
    { key: 'today', node: <AppsToday apps={todayAppsOf(rows)} front={front} /> },
    minutes === null ? null : { key: 'week', node: <AppsWeek minutesByDay={minutes} /> },
  ];
  return (
    <PhoneCardGrid
      items={cards.filter((card) => card !== null)}
      keyOf={(card) => card.key}
      render={(card) => card.node}
    />
  );
}

function OwnSheet({
  device,
  rows,
  usageAllowed,
}: {
  readonly device: Device;
  readonly rows: readonly AppRow[];
  readonly usageAllowed: boolean;
}): ReactNode {
  const router = useRouter();
  const [picked, , clear] = useSectionParam('app');
  const notificationsOf = useNotificationCounts(device.id);
  const bytesOf = useAppBytes(device.id);
  const own = usePhoneView(device).own;
  const row = rows.find((entry) => entry.package === picked) ?? null;
  return (
    <AppSheet
      device={device}
      row={row}
      facts={{
        bytes: row === null ? null : bytesOf(row.package),
        notifications: row === null ? 0 : notificationsOf(row.package),
        usageAllowed,
      }}
      canLaunch={own}
      onClose={clear}
      onShowNotifications={(app) => {
        router.push(href.settings.device(device.id, 'notifications', { app: app.package }));
      }}
    />
  );
}

function OwnApps({
  section,
  device,
}: {
  readonly section: AppsSection;
  readonly device: Device;
}): ReactNode {
  const [, pick] = useSectionParam('app');
  const [query, setQuery] = useState('');
  const rows = useMemo(() => appRowsOf(section), [section]);
  const notificationsOf = useNotificationCounts(device.id);
  const usageAllowed = featureState(featuresOf(device.details), 'usage') !== 'needs_permission';
  const front = rows.find((entry) => entry.package === section.front)?.label ?? null;
  const minutes = weekMinutesOf(usePhoneSection(device.id, 'screen'));
  return (
    <View className="gap-section-gap">
      {usageAllowed ? (
        <OwnCards rows={rows} front={front} minutes={minutes} />
      ) : (
        <PermissionNeed device={device} feature="usage" />
      )}
      <AppsList
        rows={rows}
        query={query}
        onQuery={setQuery}
        notificationsOf={notificationsOf}
        onPick={(app) => {
          pick(app.package);
        }}
      />
      <OwnSheet device={device} rows={rows} usageAllowed={usageAllowed} />
    </View>
  );
}

function OtherApps({
  section,
  device,
}: {
  readonly section: AppsSection;
  readonly device: Device;
}): ReactNode {
  const person = usePersonName(device);
  const screen = usePhoneSection(device.id, 'screen');
  return (
    <AppsTotals
      person={person}
      installed={section.installedCount}
      minutesByDay={weekMinutesOf(screen)}
    />
  );
}

export function PhoneApps({ device }: { readonly device: Device }): ReactNode {
  const person = usePersonName(device);
  return (
    <DetailSectionGate
      device={device}
      name="apps"
      noun="Apps"
      lockedText={`Apps and screen time stay with ${person}.`}
    >
      {(section, context) =>
        pageAccessOf(context.view.tier) === 'full' ? (
          <OwnApps section={section} device={context.device} />
        ) : (
          <OtherApps section={section} device={device} />
        )
      }
    </DetailSectionGate>
  );
}
