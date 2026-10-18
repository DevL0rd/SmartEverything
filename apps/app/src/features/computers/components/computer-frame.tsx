import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import type { Crumb } from '../../../components/breadcrumbs';
import type { MenuItem } from '../../../components/menu';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { CompactBody, WideBody, type FrameWidth } from '../../../components/section-body';
import { sectionParamOf } from '../../../components/use-section-param';
import { useAreaWidth } from '../../../design/size-class';
import { clock } from '../../../format/time';
import { useDevice } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { useLastSeen } from '../../devices';
import { useComputerDetail } from '../data/computer-metrics';
import { DemandRegion } from '../../../store/demand-region';
import { factsOf } from '../data/computer-device';
import { useComputerMenu } from '../overview/use-computer-menu';
import { frameLayoutOf, railWidthOf } from '../model/sections';
import { PairComputerSheet } from './pair-computer-sheet';
import { SectionRail } from './section-rail';

const RECONNECT_STEPS: readonly string[] = [
  'Check that the computer is on and connected to your network.',
  'Make sure SmartEverything is running on it.',
  'If it still doesn’t connect, pair it again.',
];

function ReconnectSheet({
  name,
  open,
  onClose,
}: {
  readonly name: string;
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <Sheet open={open} onClose={onClose} title={`Reconnect ${name}`} detents={['half']}>
      <View className="gap-3 px-4 pb-6">
        {RECONNECT_STEPS.map((step, index) => (
          <Text key={step} variant="body">
            {`${String(index + 1)}. ${step}`}
          </Text>
        ))}
      </View>
    </Sheet>
  );
}

function OfflineBanner({
  deviceId,
  name,
}: {
  readonly deviceId: string;
  readonly name: string;
}): ReactNode {
  const [help, setHelp] = useState(false);
  const seen = useLastSeen(deviceId)?.at;
  return (
    <>
      <Banner
        tone="info"
        title={seen === undefined ? 'Offline' : `Offline since ${clock(seen)}`}
        body={`${name} isn’t reachable. Its chats stay readable.`}
        wrapBody
        action={{
          label: 'How to reconnect',
          onPress: () => {
            setHelp(true);
          },
        }}
      />
      <ReconnectSheet
        name={name}
        open={help}
        onClose={() => {
          setHelp(false);
        }}
      />
    </>
  );
}

const RAIL_TOPICS = ['summary'] as const;
const NO_TOPICS = [] as const;

export interface ComputerFrameProps {
  readonly deviceId: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly crumbs?: readonly Crumb[];
  readonly width?: FrameWidth;
  readonly scroll?: boolean;
  readonly children: ReactNode;
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

function useRail(device: Device): ReactNode {
  const area = useAreaWidth();
  const features = useComputerDetail(device.id, device.online).data?.features;
  const active = sectionParamOf(useLocalSearchParams(), 'page') ?? 'overview';
  return (
    <SectionRail
      deviceId={device.id}
      active={active}
      online={device.online}
      features={features}
      os={factsOf(device).os}
      width={railWidthOf(area)}
    />
  );
}

function FrameBody({
  device,
  rail,
  scroll,
  width,
  compact,
  children,
}: {
  readonly device: Device;
  readonly scroll: boolean;
  readonly width: FrameWidth;
  readonly children: ReactNode;
  readonly rail: ReactNode;
  readonly compact: boolean;
}): ReactNode {
  const scrolls = compact && scroll;
  return (
    <DemandRegion
      deviceId={device.id}
      topics={compact ? NO_TOPICS : RAIL_TOPICS}
      className={scrolls ? 'gap-section-gap' : 'flex-1 gap-section-gap'}
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

function LiveFrame({
  device,
  title,
  subtitle,
  crumbs,
  width = 'reading',
  scroll = true,
  children,
}: Omit<ComputerFrameProps, 'deviceId'> & { readonly device: Device }): ReactNode {
  const [pair, setPair] = useState(false);
  const menu = useComputerMenu(device, () => {
    setPair(true);
  });
  const rail = useRail(device);
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
      banner={
        device.online ? undefined : <OfflineBanner deviceId={device.id} name={device.label} />
      }
    >
      <FrameBody device={device} rail={rail} scroll={scroll} width={width} compact={compact}>
        {children}
      </FrameBody>
      <PairComputerSheet
        open={pair}
        onClose={() => {
          setPair(false);
        }}
      />
    </Screen>
  );
}

export function ComputerFrame({ deviceId, ...frame }: ComputerFrameProps): ReactNode {
  const device = useDevice(deviceId);
  if (device === null) {
    return (
      <Screen maxWidth="reading" header={<PageHeader title={frame.title} overflow={[]} />}>
        {frame.children}
      </Screen>
    );
  }
  return <LiveFrame device={device} {...frame} />;
}
