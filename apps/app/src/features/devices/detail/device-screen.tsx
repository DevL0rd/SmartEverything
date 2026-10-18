import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Redirect } from 'expo-router';
import { isCamera } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { AfterPaint } from '../../../components/after-paint';
import { EmptyState } from '../../../components/empty-state';
import { Screen } from '../../../components/screen';
import { TabsBar } from '../../../components/tabs-bar';
import { useLifecycleLog } from '../../../components/use-lifecycle-log';
import { href } from '../../../app-shell/hrefs';
import { cn } from '../../../design/cn';
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
  type DeviceSection,
} from './sections';
import { MissingDevice } from './missing-device';
import { Shortcuts } from './shortcuts';
import { LaundryPage } from '../laundry/page';
import { TelevisionLead } from '../television/lead';

const log = new Logger('app.devices');

function Lead({ device }: { readonly device: Device }): ReactNode {
  if (useDeviceModel(device).family === 'television') {
    return <TelevisionLead device={device} />;
  }
  return (
    <>
      <Hero device={device} />
      <PrimaryCard device={device} />
    </>
  );
}

function Overview({
  device,
  columns,
  narrow = false,
}: {
  readonly device: Device;
  readonly columns: boolean;
  readonly narrow?: boolean;
}): ReactNode {
  const side = cn('gap-section-gap', columns && 'flex-1');
  return (
    <Screen
      header={<DeviceHeader device={device} sectionTitle={null} />}
      maxWidth={narrow ? 'reading' : 'detail'}
      banner={<DeviceBanner device={device} />}
    >
      <View className={cn('gap-section-gap', columns && 'flex-row items-start')}>
        <View className={side}>
          <Lead device={device} />
        </View>
        <View className={side}>
          <AfterPaint>
            <OverviewDetails device={device} />
            <Shortcuts device={device} />
          </AfterPaint>
        </View>
      </View>
    </Screen>
  );
}

function BesideBody({
  device,
  section,
}: {
  readonly device: Device;
  readonly section: DeviceSection;
}): ReactNode {
  return section.scrolls === true ? (
    <View className="flex-1 pt-section-gap">{section.render(device, true)}</View>
  ) : (
    <ScrollView contentContainerClassName="gap-section-gap py-section-gap">
      {section.render(device, true)}
    </ScrollView>
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
  const deviceId = device.id;
  useEffect(() => {
    log.info('section.changed', { deviceId, section: active, layout: 'split' });
  }, [deviceId, active]);
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
          <BesideBody device={device} section={shown} />
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
  const deviceId = device.id;
  const found = shown !== undefined;
  useEffect(() => {
    if (found) {
      log.info('section.changed', { deviceId, section, layout: 'page' });
    } else {
      log.warn('section.missing', { deviceId, section });
    }
  }, [deviceId, section, found]);
  return (
    <Screen
      header={
        <DeviceHeader device={device} sectionTitle={shown === undefined ? null : shown.title} />
      }
      maxWidth="detail"
      scroll={shown?.scrolls !== true}
      banner={<DeviceBanner device={device} />}
    >
      {shown === undefined ? (
        <EmptyState
          icon="puzzle"
          title="This page isn’t here"
          body="The plugin that adds it may be off or removed."
        />
      ) : shown.scrolls === true ? (
        <View className="w-full max-w-detail flex-1 self-center px-gutter">
          {shown.render(device, false)}
        </View>
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
  const { family } = useDeviceModel(device);
  if (family === 'laundry' && section === 'overview') {
    return <LaundryPage device={device} />;
  }
  if (section !== 'overview' && !(atLeast(width, 'expanded') && details)) {
    return <SubPage device={device} section={section} />;
  }
  if (!details) {
    return <Overview device={device} columns={false} narrow={width !== 'compact'} />;
  }
  if (atLeast(width, 'expanded')) {
    return <Split device={device} initial={section} />;
  }
  return <Overview device={device} columns={width === 'medium' && family !== 'television'} />;
}

export function DeviceScreen({
  deviceId,
  section,
}: {
  readonly deviceId: string;
  readonly section: string;
}): ReactNode {
  const device = useDevice(deviceId);
  const found = device !== null;
  const camera = device !== null && isCamera(device);
  useLifecycleLog(log, 'device_screen', deviceId);
  useEffect(() => {
    if (!found) {
      log.warn('device.missing', { deviceId, section });
    } else if (camera) {
      log.info('device.redirected', { deviceId, to: 'camera' });
    } else {
      log.info('device.opened', { deviceId, section });
    }
  }, [deviceId, section, found, camera]);
  if (device === null) {
    return <MissingDevice />;
  }
  if (isCamera(device)) {
    return <Redirect href={href.device(device)} />;
  }
  return <DevicePage device={device} section={section} />;
}
