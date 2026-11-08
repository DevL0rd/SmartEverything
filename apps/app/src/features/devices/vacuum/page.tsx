import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Screen } from '../../../components/screen';
import { TabsBar } from '../../../components/tabs-bar';
import { Text } from '../../../components/text';
import { atLeast, useSizeClass } from '../../../design/size-class';
import type { Device } from '../../../store/state';
import { DeviceHeader } from '../detail/device-header';
import { DeviceBanner } from '../detail/device-overview';
import { Shortcuts } from '../detail/shortcuts';
import {
  VACUUM_SHOW_PARAM,
  VACUUM_TABS,
  nextReveal,
  revealOfParam,
  revealSeqOf,
  type RevealRequest,
  type RevealTarget,
  type VacuumTab,
} from './page-model';
import { RevealBox } from './page-reveal';
import { VacuumCare } from './sections/care';
import { VacuumCleanLists } from './sections/clean-more';
import { VacuumCleanModes } from './sections/clean-modes';
import { VacuumDock } from './sections/dock';
import { VacuumHistory } from './sections/history';
import { VacuumOverview, useVacuumHeadline } from './sections/overview';
import { VacuumRooms } from './sections/rooms';
import { VacuumSchedules } from './sections/schedules';
import { VacuumSettings } from './sections/settings';
import { VacuumZones } from './sections/zones';

interface Reveal {
  readonly request: RevealRequest | null;
  readonly done: () => void;
}

function RoomsCard({ device }: { readonly device: Device }): ReactNode {
  return (
    <View className="gap-3 rounded-lg bg-surface-1 p-4">
      <Text variant="body-strong" accessibilityRole="header">
        Rooms
      </Text>
      <VacuumRooms device={device} />
    </View>
  );
}

function CleanTab({
  device,
  reveal,
}: {
  readonly device: Device;
  readonly reveal: Reveal;
}): ReactNode {
  return (
    <View className="gap-section-gap">
      <VacuumCleanModes device={device} />
      <VacuumCleanLists device={device} only={['presets']} />
      <RevealBox seq={revealSeqOf(reveal.request, 'rooms')} onRevealed={reveal.done}>
        <RoomsCard device={device} />
      </RevealBox>
      <RevealBox seq={revealSeqOf(reveal.request, 'zones')} onRevealed={reveal.done}>
        <VacuumZones device={device} />
      </RevealBox>
      <VacuumCleanLists device={device} only={['custom', 'more']} />
    </View>
  );
}

function TabBody({
  tab,
  device,
  reveal,
  onShowRooms,
}: {
  readonly tab: VacuumTab;
  readonly device: Device;
  readonly reveal: Reveal;
  readonly onShowRooms: () => void;
}): ReactNode {
  switch (tab) {
    case 'clean':
      return <CleanTab device={device} reveal={reveal} />;
    case 'schedule':
      return <VacuumSchedules device={device} />;
    case 'history':
      return <VacuumHistory device={device} />;
    case 'care':
      return (
        <View className="gap-section-gap">
          <VacuumCare device={device} />
          <VacuumDock device={device} />
        </View>
      );
    case 'settings':
      return <VacuumSettings device={device} onShowRooms={onShowRooms} />;
  }
}

function Tabs({
  tab,
  onTab,
}: {
  readonly tab: VacuumTab;
  readonly onTab: (tab: VacuumTab) => void;
}): ReactNode {
  return (
    <TabsBar
      label="Robot vacuum pages"
      active={tab}
      items={VACUUM_TABS.map((entry) => ({
        key: entry.key,
        label: entry.label,
        onPress: (): void => {
          onTab(entry.key);
        },
      }))}
    />
  );
}

function VacuumLayout({
  columns,
  hero,
  pages,
}: {
  readonly columns: boolean;
  readonly hero: ReactNode;
  readonly pages: ReactNode;
}): ReactNode {
  return columns ? (
    <View className="flex-row items-start gap-section-gap">
      <View className="min-w-0 flex-1 gap-section-gap">{hero}</View>
      <View className="min-w-0 flex-1 gap-section-gap">{pages}</View>
    </View>
  ) : (
    <View className="gap-section-gap">
      {hero}
      {pages}
    </View>
  );
}

export function VacuumPage({ device }: { readonly device: Device }): ReactNode {
  const { width } = useSizeClass();
  const [tab, setTab] = useState<VacuumTab>('clean');
  const shown = useLocalSearchParams()[VACUUM_SHOW_PARAM];
  const [request, setRequest] = useState<RevealRequest | null>(() => revealOfParam(shown));
  const reveal: Reveal = {
    request,
    done: (): void => {
      setRequest(null);
    },
  };
  const show = (target: RevealTarget): void => {
    setTab('clean');
    setRequest(nextReveal(request, target));
  };
  const hero = <VacuumOverview device={device} onShow={show} />;
  const pages = (
    <>
      <Tabs tab={tab} onTab={setTab} />
      <TabBody
        tab={tab}
        device={device}
        reveal={reveal}
        onShowRooms={(): void => {
          show('rooms');
        }}
      />
      <Shortcuts device={device} />
    </>
  );
  const columns = atLeast(width, 'expanded');
  const headline = useVacuumHeadline(device);
  return (
    <Screen
      header={<DeviceHeader device={device} sectionTitle={null} stateLine={headline} />}
      maxWidth={width === 'medium' ? 'reading' : 'detail'}
      banner={<DeviceBanner device={device} />}
    >
      <VacuumLayout columns={columns} hero={hero} pages={pages} />
    </Screen>
  );
}
