import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import type { PhoneDetail } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { EmptyState } from '../../../components/empty-state';
import { Figure } from '../../../components/figure';
import { ReasonLine } from '../../../components/reason-line';
import { Text } from '../../../components/text';
import { useSectionParam } from '../../../components/use-section-param';
import { useRow } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { DetailSectionGate, type GateContext } from '../components/detail-section-gate';
import { PermissionNeed } from '../components/permission-need';
import { PhoneCardGrid } from '../frame/phone-grid';
import { usePhoneSection } from '../data/phone-detail';
import { featuresOf, featureState } from '../model/face-model';
import { pageAccessOf } from '../model/page-access';
import { countEntriesOf, groupsOf, type NotificationGroup } from '../model/notifications-model';
import { CountCard } from './count-card';
import { TitlesOffCard } from './titles-card';
import { TitlesList } from './titles-list';

type NotificationsSection = NonNullable<PhoneDetail['notifications']>;

function usePersonName(device: Device): string {
  const profileId = device.details['profileId'];
  return (
    useRow('profiles', typeof profileId === 'string' ? profileId : null)?.name ?? 'this person'
  );
}

function useIconOf(deviceId: string): (app: string) => string | null {
  const apps = usePhoneSection(deviceId, 'apps');
  return (app) => apps?.installed.find((entry) => entry.package === app)?.iconHash ?? null;
}

function OnlyApp({
  group,
  onAll,
}: {
  readonly group: NotificationGroup | undefined;
  readonly onAll: () => void;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap items-center gap-3">
      <Text variant="callout" tone="variant" className="min-w-0 flex-1">
        {group === undefined ? 'Nothing waiting from that app.' : `Only ${group.label}`}
      </Text>
      <Button label="Show all" variant="tonal" onPress={onAll} />
    </View>
  );
}

function OwnNotifications({
  section,
  context,
}: {
  readonly section: NotificationsSection;
  readonly context: GateContext;
}): ReactNode {
  const { device } = context;
  const [only, , clear] = useSectionParam('app');
  const iconOf = useIconOf(device.id);
  const all = useMemo(() => groupsOf(section), [section]);
  const groups = only === null ? all : all.filter((group) => group.package === only);
  const titles = section.items !== null;
  return (
    <View className="gap-section-gap">
      <PermissionNeed device={device} feature="notifications" />
      {only === null ? null : <OnlyApp group={groups[0]} onAll={clear} />}
      <PhoneCardGrid
        items={[
          {
            key: 'counts',
            node: <CountCard total={section.count} entries={countEntriesOf(section)} />,
          },
          {
            key: 'titles',
            node: titles ? (
              <TitlesList device={device} groups={groups} iconOf={iconOf} />
            ) : (
              <TitlesOffCard device={device} />
            ),
          },
        ]}
        keyOf={(card) => card.key}
        render={(card) => card.node}
      />
    </View>
  );
}

function OtherNotifications({
  section,
  device,
}: {
  readonly section: NotificationsSection;
  readonly device: Device;
}): ReactNode {
  const person = usePersonName(device);
  return (
    <View className="gap-section-gap">
      <Card title="Waiting on the phone" icon="bell">
        <Figure value={String(section.count)} size="l" />
      </Card>
      <ReasonLine
        icon="lock"
        text={`Notification titles and app names stay with ${person}. You see the count.`}
      />
    </View>
  );
}

export function PhoneNotifications({ device }: { readonly device: Device }): ReactNode {
  const person = usePersonName(device);
  return (
    <DetailSectionGate
      device={device}
      name="notifications"
      noun="Notifications"
      lockedText={`Notifications stay with ${person}.`}
    >
      {(section, context) => {
        if (section.count === 0) {
          return featureState(featuresOf(device.details), 'notifications') ===
            'needs_permission' ? (
            <PermissionNeed device={device} feature="notifications" />
          ) : (
            <EmptyState
              icon="bellOff"
              title="No notifications"
              body="Nothing is waiting on the phone."
            />
          );
        }
        return pageAccessOf(context.view.tier) === 'full' ? (
          <OwnNotifications section={section} context={context} />
        ) : (
          <OtherNotifications section={section} device={device} />
        );
      }}
    </DetailSectionGate>
  );
}
