import type { TreadmillStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import type { IconName } from '../../../components/icon';
import { Skeleton } from '../../../components/skeleton';
import { WidgetEmpty, WidgetFrame } from '../../../components/widget-board';
import { useIsOwner } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { useTreadmillDemand, useTreadmillState } from '../data/treadmill-data';
import { useTreadmillDevice } from '../data/use-treadmill-device';

interface Props {
  readonly title: string;
  readonly icon: IconName;
  readonly live?: boolean;
  readonly action?: (device: Device, view: TreadmillStateView) => ReactNode;
  readonly children: (device: Device, view: TreadmillStateView) => ReactNode;
}

function Waiting(): ReactNode {
  return (
    <View aria-hidden className="gap-3">
      <Skeleton shape="text" />
      <Skeleton shape="block" className="h-12" />
    </View>
  );
}

function NoTreadmill(props: Pick<Props, 'title' | 'icon'>): ReactNode {
  const owner = useIsOwner();
  return (
    <WidgetFrame title={props.title} icon={props.icon} accent="primary">
      <WidgetEmpty
        icon="footprints"
        colour="primary"
        title="No treadmill yet"
        body={owner ? 'Add a WalkingPad to see it here.' : 'Ask the owner to add the treadmill.'}
        {...(owner ? { action: { label: 'Add treadmill', href: href.connect('treadmill') } } : {})}
      />
    </WidgetFrame>
  );
}

function WithDevice({ device, ...props }: Props & { readonly device: Device }): ReactNode {
  const state = useTreadmillState(device.id);
  useTreadmillDemand(device.id, props.live !== false);
  const view = state.data;
  return (
    <WidgetFrame
      title={props.title}
      icon={props.icon}
      accent="primary"
      href={href.device(device)}
      action={
        view === undefined || props.action === undefined ? undefined : props.action(device, view)
      }
    >
      {view === undefined ? <Waiting /> : props.children(device, view)}
    </WidgetFrame>
  );
}

export function TreadmillWidgetShell(props: Props): ReactNode {
  const device = useTreadmillDevice();
  return device === null ? <NoTreadmill {...props} /> : <WithDevice device={device} {...props} />;
}
