import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import type { Crumb } from '../../../components/breadcrumbs';
import type { MenuItem } from '../../../components/menu';
import { PageShell } from '../../../components/page-shell/page-shell';
import { useShellRailShown } from '../../../components/page-shell/rail-shown';
import type { ShellSearchConfig } from '../../../components/page-shell/search-slot';
import type { ShellAction } from '../../../components/page-shell/shell-actions';
import type { PrimaryActionProps } from '../../../components/primary-action';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { sectionParamOf } from '../../../components/use-section-param';
import { clock } from '../../../format/time';
import { useDevice } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { useLastSeen } from '../../devices';
import { useComputerDetail } from '../data/computer-metrics';
import { DemandRegion } from '../../../store/demand-region';
import { useComputerMenu } from '../overview/use-computer-menu';
import { computerSectionsOf } from './computer-sections';
import { PairComputerSheet } from './pair-computer-sheet';

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
  readonly scroll?: boolean;
  readonly actions?: readonly ShellAction[];
  readonly primary?: PrimaryActionProps;
  readonly search?: ShellSearchConfig;
  readonly iconRail?: boolean;
  readonly overflow?: readonly MenuItem[];
  readonly controls?: ReactNode;
  readonly children: ReactNode;
}

type LiveProps = Omit<ComputerFrameProps, 'deviceId'> & { readonly device: Device };

function crumbsOf(device: Device, crumbs: readonly Crumb[] | undefined): readonly Crumb[] {
  return (
    crumbs ?? [
      { label: 'Devices', href: href.devices() },
      { label: device.label, href: href.settings.device(device.id, 'overview') },
    ]
  );
}

function useSections(device: Device, iconRail: boolean): ReturnType<typeof computerSectionsOf> {
  const features = useComputerDetail(device.id, device.online).data?.features;
  const active = sectionParamOf(useLocalSearchParams(), 'page') ?? 'overview';
  const sections = computerSectionsOf({
    deviceId: device.id,
    active,
    features,
  });
  return iconRail ? { ...sections, iconRail } : sections;
}

function frameMenuOf(
  page: readonly MenuItem[] | undefined,
  menu: readonly MenuItem[],
): readonly MenuItem[] {
  return page === undefined ? menu : [...page, ...menu];
}

function LiveFrame({
  device,
  scroll = true,
  primary,
  search,
  actions,
  iconRail,
  overflow,
  controls,
  children,
  ...head
}: LiveProps): ReactNode {
  const [pair, setPair] = useState(false);
  const menu = useComputerMenu(device, () => {
    setPair(true);
  });
  const sections = useSections(device, iconRail === true);
  const railShown = useShellRailShown();
  return (
    <PageShell
      title={head.title}
      subtitle={head.subtitle ?? device.label}
      breadcrumbs={crumbsOf(device, head.crumbs)}
      overflow={frameMenuOf(overflow, menu)}
      sections={sections}
      controls={controls}
      scroll={scroll}
      {...(actions === undefined ? {} : { actions })}
      {...(search === undefined ? {} : { search })}
      {...(primary === undefined ? {} : { primaryAction: primary })}
      {...(device.online
        ? {}
        : { banner: <OfflineBanner deviceId={device.id} name={device.label} /> })}
    >
      <DemandRegion
        deviceId={device.id}
        topics={railShown ? RAIL_TOPICS : NO_TOPICS}
        className={scroll ? 'gap-section-gap' : 'min-h-0 flex-1 gap-section-gap'}
      >
        {children}
      </DemandRegion>
      <PairComputerSheet
        open={pair}
        onClose={() => {
          setPair(false);
        }}
      />
    </PageShell>
  );
}

export function ComputerFrame({ deviceId, ...frame }: ComputerFrameProps): ReactNode {
  const device = useDevice(deviceId);
  if (device === null) {
    return <PageShell title={frame.title}>{frame.children}</PageShell>;
  }
  return <LiveFrame device={device} {...frame} />;
}
