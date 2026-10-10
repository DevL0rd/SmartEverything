import type { ReactNode } from 'react';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Redirect } from 'expo-router';
import { isCamera } from '@smarteverything/domain';
import { EmptyState } from '../../../components/empty-state';
import { Screen } from '../../../components/screen';
import { TabsBar } from '../../../components/tabs-bar';
import { href } from '../../../app-shell/hrefs';
import { atLeast, useSizeClass } from '../../../design/size-class';
import { useDevice } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { useDeviceModel } from '../model/device-model';
import { DeviceHeader } from './device-header';
import { DeviceBanner, Hero, PrimaryCard } from './device-overview';
import {
  findSection,
  sectionOf,
  sectionsOf,
  useHasOverviewDetails,
  OverviewDetails,
} from './sections';
import { MissingDevice } from './missing-device';
import { Shortcuts } from './shortcuts';

function Lead({ device }: { readonly device: Device }): ReactNode {
  return (
    <>
      <Hero device={device} />
      <PrimaryCard device={device} />
    </>
  );
}

function Stacked({
  device,
  narrow = false,
}: {
  readonly device: Device;
  readonly narrow?: boolean;
}): ReactNode {
  return (
    <Screen
      header={<DeviceHeader device={device} sectionTitle={null} />}
      maxWidth={narrow ? 'reading' : 'detail'}
      banner={<DeviceBanner device={device} />}
    >
      <Lead device={device} />
      <OverviewDetails device={device} />
      <Shortcuts device={device} />
    </Screen>
  );
}

function TwoColumns({ device }: { readonly device: Device }): ReactNode {
  return (
    <Screen
      header={<DeviceHeader device={device} sectionTitle={null} />}
      maxWidth="detail"
      banner={<DeviceBanner device={device} />}
    >
      <View className="flex-row items-start gap-section-gap">
        <View className="flex-1 gap-section-gap">
          <Lead device={device} />
        </View>
        <View className="flex-1 gap-section-gap">
          <OverviewDetails device={device} />
          <Shortcuts device={device} />
        </View>
      </View>
    </Screen>
  );
}

function Split({
  device,
  initial,
}: {
  readonly device: Device;
  readonly initial: string;
}): ReactNode {
  const model = useDeviceModel(device);
  const sections = sectionsOf(model);
  const [active, setActive] = useState(initial);
  const shown = sections.find((section) => section.key === active) ?? sectionOf('overview');
  return (
    <Screen
      header={<DeviceHeader device={device} sectionTitle={null} />}
      maxWidth="detail"
      scroll={false}
    >
      <View className="w-full max-w-detail flex-1 flex-row gap-section-gap self-center px-gutter">
        <ScrollView
          className="max-w-140 flex-1"
          contentContainerClassName="gap-section-gap pb-section-gap pt-2"
        >
          <DeviceBanner device={device} />
          <Lead device={device} />
        </ScrollView>
        <View className="flex-1">
          <TabsBar
            label="Device pages"
            active={shown.key}
            items={sections.map((section) => ({
              key: section.key,
              label: section.key === 'controls' ? 'Controls' : section.title,
              onPress: (): void => {
                setActive(section.key);
              },
            }))}
          />
          <ScrollView contentContainerClassName="gap-section-gap py-section-gap">
            {shown.render(device, true)}
          </ScrollView>
        </View>
      </View>
    </Screen>
  );
}

function SubPage({
  device,
  section,
}: {
  readonly device: Device;
  readonly section: string;
}): ReactNode {
  const shown = findSection(useDeviceModel(device), section);
  return (
    <Screen
      header={
        <DeviceHeader device={device} sectionTitle={shown === undefined ? null : shown.title} />
      }
      maxWidth="detail"
      banner={<DeviceBanner device={device} />}
    >
      {shown === undefined ? (
        <EmptyState
          icon="puzzle"
          title="This page isn’t here"
          body="The plugin that adds it may be off or removed."
        />
      ) : (
        shown.render(device, false)
      )}
    </Screen>
  );
}

function DevicePage({
  device,
  section,
}: {
  readonly device: Device;
  readonly section: string;
}): ReactNode {
  const { width } = useSizeClass();
  const details = useHasOverviewDetails(device);
  if (section !== 'overview' && !(atLeast(width, 'expanded') && details)) {
    return <SubPage device={device} section={section} />;
  }
  if (!details) {
    return <Stacked device={device} narrow={width !== 'compact'} />;
  }
  if (atLeast(width, 'expanded')) {
    return <Split device={device} initial={section} />;
  }
  return width === 'medium' ? <TwoColumns device={device} /> : <Stacked device={device} />;
}

export function DeviceScreen({
  deviceId,
  section,
}: {
  readonly deviceId: string;
  readonly section: string;
}): ReactNode {
  const device = useDevice(deviceId);
  if (device === null) {
    return <MissingDevice />;
  }
  if (isCamera(device)) {
    return <Redirect href={href.device(device)} />;
  }
  return <DevicePage device={device} section={section} />;
}
