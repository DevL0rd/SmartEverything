import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { ScrollView, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { isCamera, type DeviceFamily } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { AfterPaint } from '../../../components/after-paint';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { Screen } from '../../../components/screen';
import { TabsBar } from '../../../components/tabs-bar';
import { useLifecycleLog } from '../../../components/use-lifecycle-log';
import { href } from '../../../app-shell/hrefs';
import { cn } from '../../../design/cn';
import { atLeast, useSizeClass } from '../../../design/size-class';
import { useDevice } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { useDeviceModel, type DeviceModel } from '../model/device-model';
import { DeviceHeader } from './device-header';
import { DeviceBanner, Hero, PrimaryCard } from './device-overview';
import {
  sectionHref,
  sectionsOf,
  useHasOverviewDetails,
  OverviewDetails,
  type DeviceSection,
} from './sections';
import { MissingDevice } from './missing-device';
import { Shortcuts } from './shortcuts';
import { LaundryPage } from '../laundry/page';
import { TelevisionLead } from '../television/lead';
import { VacuumPage } from '../vacuum/page';

const log = new Logger('app.devices');

interface FamilyPage {
  readonly page?: (props: { readonly device: Device }) => ReactNode;
  readonly lead?: (props: { readonly device: Device }) => ReactNode;
  readonly singleColumn?: true;
}

const FAMILY_PAGES: Readonly<Partial<Record<DeviceFamily, FamilyPage>>> = {
  laundry: { page: LaundryPage },
  television: { lead: TelevisionLead, singleColumn: true },
  vacuum: { page: VacuumPage },
};

function Lead({ device }: { readonly device: Device }): ReactNode {
  const Custom = FAMILY_PAGES[useDeviceModel(device).family]?.lead;
  if (Custom !== undefined) {
    return <Custom device={device} />;
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
      header={<DeviceHeader device={device} sectionTitle={null} titleLines="wrap" />}
      maxWidth={narrow ? 'reading' : 'detail'}
    >
      <DeviceBanner device={device} />
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

function StaticDetailBody({
  className,
  children,
}: {
  readonly className?: string;
  readonly children: ReactNode;
}): ReactNode {
  return <View className={cn('w-full flex-1 px-gutter', className)}>{children}</View>;
}

function useOpenSection(device: Device, active: string): (next: string) => void {
  const router = useRouter();
  return (next): void => {
    if (next === active) return;
    if (next === 'overview') {
      router.dismissTo(href.device(device));
      return;
    }
    const target = sectionHref(device.id, next);
    if (active === 'overview') {
      router.push(target);
    } else {
      router.replace(target);
    }
  };
}

function Split({
  device,
  shown,
  sections,
}: {
  readonly device: Device;
  readonly shown: DeviceSection;
  readonly sections: readonly DeviceSection[];
}): ReactNode {
  const { key: active } = shown;
  const openSection = useOpenSection(device, active);
  const deviceId = device.id;
  useEffect(() => {
    log.info('section.changed', { deviceId, section: active, layout: 'split' });
  }, [deviceId, active]);
  return (
    <Screen header={<DeviceHeader device={device} sectionTitle={null} />} scroll={false}>
      <StaticDetailBody className="flex-row gap-section-gap">
        <ScrollView
          className="max-w-140 flex-1"
          contentContainerClassName="gap-section-gap pb-section-gap pt-2"
        >
          <DeviceBanner device={device} />
          <Lead device={device} />
        </ScrollView>
        <View className="min-w-0 flex-1">
          <TabsBar
            label="Device pages"
            active={active}
            items={sections.map((section) => ({
              key: section.key,
              label: section.key === 'controls' ? 'Controls' : section.title,
              onPress: (): void => {
                openSection(section.key);
              },
            }))}
          />
          <BesideBody device={device} section={shown} />
        </View>
      </StaticDetailBody>
    </Screen>
  );
}

function SubPage({
  device,
  section,
  shown,
}: {
  readonly device: Device;
  readonly section: string;
  readonly shown: DeviceSection | undefined;
}): ReactNode {
  const deviceId = device.id;
  const found = shown !== undefined;
  const scroll = shown?.scrolls !== true;
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
      scroll={scroll}
      banner={scroll ? undefined : <DeviceBanner device={device} />}
    >
      {scroll ? <DeviceBanner device={device} /> : null}
      {shown === undefined ? (
        <EmptyState
          icon="puzzle"
          title="This page isn’t here"
          body="This page may have moved or its plugin may be unavailable."
          action={<Button label="Back to device" href={href.device(device)} />}
        />
      ) : shown.scrolls === true ? (
        <StaticDetailBody>{shown.render(device, false)}</StaticDetailBody>
      ) : (
        shown.render(device, false)
      )}
    </Screen>
  );
}

function GenericPage({
  model,
  section,
}: {
  readonly model: DeviceModel;
  readonly section: string;
}): ReactNode {
  const { device, family } = model;
  const { width } = useSizeClass();
  const details = useHasOverviewDetails(device);
  const split = atLeast(width, 'expanded') && details;
  if (section === 'overview' && !split) {
    const columns = details && width === 'medium' && FAMILY_PAGES[family]?.singleColumn !== true;
    return <Overview device={device} columns={columns} narrow={!details && width !== 'compact'} />;
  }
  const sections = sectionsOf(model);
  const shown = sections.find(({ key }) => key === section);
  return split && shown !== undefined ? (
    <Split device={device} shown={shown} sections={sections} />
  ) : (
    <SubPage device={device} section={section} shown={shown} />
  );
}

function DevicePage({
  device,
  section,
}: {
  readonly device: Device;
  readonly section: string;
}): ReactNode {
  const model = useDeviceModel(device);
  const Page = FAMILY_PAGES[model.family]?.page;
  if (Page !== undefined && section === 'overview') {
    return <Page device={device} />;
  }
  return <GenericPage model={model} section={section} />;
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
