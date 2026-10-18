import type { ReactNode } from 'react';
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import type { Crumb } from '../../../components/breadcrumbs';
import type { MenuItem } from '../../../components/menu';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { CompactBody, WideBody, type FrameWidth } from '../../../components/section-body';
import { EmptyState } from '../../../components/empty-state';
import { sectionParamOf } from '../../../components/use-section-param';
import { useAreaWidth } from '../../../design/size-class';
import { clock } from '../../../format/time';
import { sameJson } from '../../../store/same-json';
import { DemandRegion } from '../../../store/demand-region';
import { useDevice, useDeviceDerived } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { useLastSeen } from '../../devices';
import { PHONE_LIVE_TOPICS } from '../data/phone-live';
import { frameLayoutOf, railWidthOf, type PhoneSectionId } from '../model/sections';
import { phoneReadingsOf } from '../phone-values';
import { OpenLinkContext } from './open-link';
import { OpenLinkSheet } from './open-link-sheet';
import { PhoneRail } from './phone-rail';
import { PhoneStatusRow } from './phone-status';
import { usePhoneMenu } from './use-phone-menu';

const NO_HIDDEN: ReadonlySet<PhoneSectionId> = new Set();
const NO_BATTERY: ReadonlySet<PhoneSectionId> = new Set(['battery']);

export interface PhoneFrameProps {
  readonly deviceId: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly crumbs?: readonly Crumb[];
  readonly width?: FrameWidth;
  readonly scroll?: boolean;
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

function useHidden(device: Device): ReadonlySet<PhoneSectionId> {
  const hasBattery = useDeviceDerived(
    device.id,
    (values) => phoneReadingsOf(values).battery !== null,
    [],
    sameJson,
  );
  return hasBattery ? NO_HIDDEN : NO_BATTERY;
}

function FrameBody({
  device,
  scroll,
  width,
  children,
}: {
  readonly device: Device;
  readonly scroll: boolean;
  readonly width: FrameWidth;
  readonly children: ReactNode;
}): ReactNode {
  const area = useAreaWidth();
  const hidden = useHidden(device);
  const active = sectionParamOf(useLocalSearchParams(), 'page') ?? 'overview';
  const compact = frameLayoutOf(area) === 'compact';
  const rail = (
    <PhoneRail
      deviceId={device.id}
      active={active}
      online={device.online}
      hidden={hidden}
      width={railWidthOf(area)}
    />
  );
  return (
    <DemandRegion
      deviceId={device.id}
      topics={PHONE_LIVE_TOPICS}
      className={compact && scroll ? 'gap-section-gap' : 'flex-1 gap-section-gap'}
    >
      {compact ? (
        <CompactBody scroll={scroll} width={width}>
          {children}
        </CompactBody>
      ) : (
        <WideBody scroll={scroll} width={width} rail={rail}>
          {children}
        </WideBody>
      )}
    </DemandRegion>
  );
}

function FrameHeader({
  device,
  title,
  subtitle,
  crumbs,
  menu,
}: {
  readonly device: Device;
  readonly title: string;
  readonly subtitle: string | undefined;
  readonly crumbs: readonly Crumb[] | undefined;
  readonly menu: readonly MenuItem[];
}): ReactNode {
  return (
    <PageHeader
      title={title}
      subtitle={subtitle ?? device.label}
      below={<PhoneStatusRow device={device} />}
      breadcrumbs={
        crumbs ?? [
          { label: 'Devices', href: href.devices() },
          { label: device.label, href: href.settings.device(device.id, 'overview') },
        ]
      }
      overflow={menu}
    />
  );
}

function LiveFrame({
  device,
  title,
  subtitle,
  crumbs,
  width = 'reading',
  scroll = true,
  children,
}: Omit<PhoneFrameProps, 'deviceId'> & { readonly device: Device }): ReactNode {
  const [link, setLink] = useState(false);
  const openLink = (): void => {
    setLink(true);
  };
  const menu = usePhoneMenu(device, openLink);
  const compact = frameLayoutOf(useAreaWidth()) === 'compact';
  const scrolls = compact && scroll;
  return (
    <Screen
      maxWidth={compact ? width : 'full'}
      scroll={scrolls}
      header={
        <FrameHeader
          device={device}
          title={title}
          subtitle={subtitle}
          crumbs={crumbs}
          menu={menu}
        />
      }
      banner={device.online ? undefined : <OfflineBanner device={device} />}
    >
      <OpenLinkContext.Provider value={openLink}>
        <FrameBody device={device} scroll={scroll} width={width}>
          {children}
        </FrameBody>
      </OpenLinkContext.Provider>
      <OpenLinkSheet
        device={device}
        open={link}
        onClose={() => {
          setLink(false);
        }}
      />
    </Screen>
  );
}

export function PhoneFrame({ deviceId, ...frame }: PhoneFrameProps): ReactNode {
  const device = useDevice(deviceId);
  if (device === null) {
    return (
      <Screen maxWidth="reading" header={<PageHeader title={frame.title} overflow={[]} />}>
        <EmptyState
          icon="smartphone"
          title="Phone unavailable"
          body="This phone is no longer in your home."
        />
      </Screen>
    );
  }
  return <LiveFrame device={device} {...frame} />;
}
