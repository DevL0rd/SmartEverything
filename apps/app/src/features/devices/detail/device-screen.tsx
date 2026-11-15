import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { isCamera, type DeviceFamily } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { AfterPaint } from '../../../components/after-paint';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { useFrameBodyWidth } from '../../../components/page-shell/body-width';
import { twoFrameColumnsAt } from '../../../components/page-shell/layout';
import { PageShell } from '../../../components/page-shell/page-shell';
import type { ShellSearchConfig } from '../../../components/page-shell/search-slot';
import { useLifecycleLog } from '../../../components/use-lifecycle-log';
import { useSectionParam } from '../../../components/use-section-param';
import { href } from '../../../app-shell/hrefs';
import { cn } from '../../../design/cn';
import {
  SectionSearchContext,
  useSectionSearchState,
  type SectionSearch,
} from '../../../plugins/shared/section-search';
import { useDevice } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { useDeviceModel, type DeviceModel } from '../model/device-model';
import { DeviceBanners, useDeviceShell } from './device-shell';
import { Hero, PrimaryCard } from './device-overview';
import { sectionsOf, useHasOverviewDetails, OverviewDetails, type DeviceSection } from './sections';
import { MissingDevice } from './missing-device';
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

function OverviewBody({ model }: { readonly model: DeviceModel }): ReactNode {
  const { device, family } = model;
  const details = useHasOverviewDetails(device);
  const bodyWidth = useFrameBodyWidth();
  const columns =
    details && FAMILY_PAGES[family]?.singleColumn !== true && twoFrameColumnsAt(bodyWidth);
  const side = cn('gap-section-gap', columns && 'min-w-0 flex-1');
  return (
    <View className={cn('gap-section-gap', columns && 'flex-row items-start')}>
      <View className={side}>
        <Lead device={device} />
      </View>
      {details ? (
        <View className={side}>
          <AfterPaint>
            <OverviewDetails device={device} />
          </AfterPaint>
        </View>
      ) : null}
    </View>
  );
}

function SectionBody({
  device,
  shown,
}: {
  readonly device: Device;
  readonly shown: DeviceSection | undefined;
}): ReactNode {
  if (shown === undefined) {
    return (
      <EmptyState
        icon="puzzle"
        title="This page isn’t here"
        body="This page may have moved or its plugin may be unavailable."
        action={<Button label="Back to device" href={href.device(device)} />}
      />
    );
  }
  return shown.render(device, false);
}

function useSectionLog(deviceId: string, section: string, found: boolean): void {
  useEffect(() => {
    if (found) {
      log.info('section.changed', { deviceId, section });
    } else {
      log.warn('section.missing', { deviceId, section });
    }
  }, [deviceId, section, found]);
}

function shellSearchOf(
  shown: DeviceSection | undefined,
  search: SectionSearch,
): { readonly search: ShellSearchConfig } | Record<string, never> {
  return shown?.search === undefined
    ? {}
    : { search: { ...search, placeholder: shown.search.placeholder } };
}

function GenericPage({
  model,
  section,
}: {
  readonly model: DeviceModel;
  readonly section: string;
}): ReactNode {
  const { device } = model;
  const shell = useDeviceShell(device, section);
  const shown = sectionsOf(model).find(({ key }) => key === section);
  const [initial] = useSectionParam('search');
  const search = useSectionSearchState(`${section}|${initial ?? ''}`, initial ?? '');
  useSectionLog(device.id, section, shown !== undefined);
  return (
    <PageShell
      {...shell.props}
      {...shellSearchOf(shown, search)}
      width="detail"
      scroll={shown?.scrolls !== true}
      banner={<DeviceBanners device={device} schedule={shell.schedule} />}
    >
      {section === 'overview' ? (
        <OverviewBody model={model} />
      ) : (
        <SectionSearchContext value={shown?.search === undefined ? null : search}>
          <SectionBody device={device} shown={shown} />
        </SectionSearchContext>
      )}
    </PageShell>
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
