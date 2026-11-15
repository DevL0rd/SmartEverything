import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import type { Crumb } from '../../../components/breadcrumbs';
import { EmptyState } from '../../../components/empty-state';
import { PageShell } from '../../../components/page-shell/page-shell';
import type { ShellSearchConfig } from '../../../components/page-shell/search-slot';
import type { ShellSections } from '../../../components/page-shell/shell-sections';
import { sectionParamOf } from '../../../components/use-section-param';
import { clock } from '../../../format/time';
import { sameJson } from '../../../store/same-json';
import { DemandRegion } from '../../../store/demand-region';
import { useDevice, useDeviceDerived } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { useLastSeen } from '../../devices';
import { PHONE_LIVE_TOPICS } from '../data/phone-live';
import type { PhoneSectionId } from '../model/sections';
import { phoneReadingsOf } from '../phone-values';
import { OpenLinkContext } from './open-link';
import { OpenLinkSheet } from './open-link-sheet';
import { phoneSectionsOf } from './phone-sections';
import { PhoneStatusRow } from './phone-status';
import { usePhoneMenu } from './use-phone-menu';

const NO_HIDDEN: ReadonlySet<PhoneSectionId> = new Set();
const NO_BATTERY: ReadonlySet<PhoneSectionId> = new Set(['battery']);

export interface PhoneFrameProps {
  readonly deviceId: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly crumbs?: readonly Crumb[];
  readonly scroll?: boolean;
  readonly search?: ShellSearchConfig;
  readonly children: ReactNode;
}

function OfflineBanner({ device }: { readonly device: Device }): ReactNode {
  const seen = useLastSeen(device.id)?.at;
  return (
    <Banner
      tone="info"
      title={seen === undefined ? 'Phone is offline' : `Phone is offline since ${clock(seen)}`}
      body="Commands wait until it is back. Its last readings stay visible."
      wrapBody
    />
  );
}

function FrameBanner({ device }: { readonly device: Device }): ReactNode {
  return (
    <View className="gap-3">
      <PhoneStatusRow device={device} />
      {device.online ? null : <OfflineBanner device={device} />}
    </View>
  );
}

function useSections(device: Device): ShellSections {
  const hasBattery = useDeviceDerived(
    device.id,
    (values) => phoneReadingsOf(values).battery !== null,
    [],
    sameJson,
  );
  const active = sectionParamOf(useLocalSearchParams(), 'page') ?? 'overview';
  return phoneSectionsOf({
    deviceId: device.id,
    active,
    hidden: hasBattery ? NO_HIDDEN : NO_BATTERY,
  });
}

function crumbsOf(device: Device, crumbs: readonly Crumb[] | undefined): readonly Crumb[] {
  return (
    crumbs ?? [
      { label: 'Devices', href: href.devices() },
      { label: device.label, href: href.settings.device(device.id, 'overview') },
    ]
  );
}

function subtitleOf(
  head: Pick<PhoneFrameProps, 'title' | 'subtitle'>,
  device: Device,
): { readonly subtitle?: string } {
  if (head.subtitle !== undefined) return { subtitle: head.subtitle };
  return head.title === device.label ? {} : { subtitle: device.label };
}

function LiveFrame({
  device,
  scroll = true,
  search,
  children,
  ...head
}: Omit<PhoneFrameProps, 'deviceId'> & { readonly device: Device }): ReactNode {
  const [link, setLink] = useState(false);
  const openLink = (): void => {
    setLink(true);
  };
  const menu = usePhoneMenu(device, openLink);
  const sections = useSections(device);
  return (
    <PageShell
      title={head.title}
      {...subtitleOf(head, device)}
      breadcrumbs={crumbsOf(device, head.crumbs)}
      overflow={menu}
      sections={sections}
      scroll={scroll}
      banner={<FrameBanner device={device} />}
      {...(search === undefined ? {} : { search })}
    >
      <OpenLinkContext value={openLink}>
        <DemandRegion
          deviceId={device.id}
          topics={PHONE_LIVE_TOPICS}
          className={scroll ? 'gap-section-gap' : 'min-h-0 flex-1 gap-section-gap'}
        >
          {children}
        </DemandRegion>
      </OpenLinkContext>
      <OpenLinkSheet
        device={device}
        open={link}
        onClose={() => {
          setLink(false);
        }}
      />
    </PageShell>
  );
}

export function PhoneFrame({ deviceId, ...frame }: PhoneFrameProps): ReactNode {
  const device = useDevice(deviceId);
  if (device === null) {
    return (
      <PageShell title={frame.title}>
        <EmptyState
          icon="smartphone"
          title="Phone unavailable"
          body="This phone is no longer in your home."
        />
      </PageShell>
    );
  }
  return <LiveFrame device={device} {...frame} />;
}
