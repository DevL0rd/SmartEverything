import type { BottleStatusView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { background } from '@smarteverything/logging';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import type { IconName } from '../../../components/icon';
import { ErrorState } from '../../../components/error-state';
import { Skeleton } from '../../../components/skeleton';
import { WidgetEmpty, WidgetFrame } from '../../../components/widget-board';
import { useIsOwner } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { useBottleStatus } from '../data/bottle-data';
import { useBottleDevice } from '../data/use-bottle-device';

interface Props {
  readonly title: string;
  readonly icon: IconName;
  readonly children: (device: Device, view: BottleStatusView) => ReactNode;
}

function Waiting(): ReactNode {
  return (
    <View aria-hidden className="gap-3">
      <Skeleton shape="text" />
      <Skeleton shape="block" className="h-12" />
    </View>
  );
}

function NoBottle(props: Pick<Props, 'title' | 'icon'>): ReactNode {
  const owner = useIsOwner();
  return (
    <WidgetFrame title={props.title} icon={props.icon} accent="primary">
      <WidgetEmpty
        icon="glassWater"
        colour="primary"
        title="No water bottle for you yet"
        body={
          owner
            ? 'Add a LARQ bottle for yourself to see it here.'
            : 'Ask the owner to add a bottle for you.'
        }
        {...(owner ? { action: { label: 'Add bottle', href: href.connect('larq') } } : {})}
      />
    </WidgetFrame>
  );
}

function Body({ device, ...props }: Props & { readonly device: Device }): ReactNode {
  const status = useBottleStatus(device.id);
  if (status.isError) {
    return (
      <ErrorState
        error={status.error}
        retry={() => {
          background(status.refetch(), 'queries.refetch_failed');
        }}
      />
    );
  }
  return status.data === undefined ? <Waiting /> : props.children(device, status.data);
}

function WithDevice({ device, ...props }: Props & { readonly device: Device }): ReactNode {
  return (
    <WidgetFrame title={props.title} icon={props.icon} accent="primary" href={href.device(device)}>
      <Body device={device} {...props} />
    </WidgetFrame>
  );
}

export function BottleWidgetShell(props: Props): ReactNode {
  const device = useBottleDevice();
  return device === null ? <NoBottle {...props} /> : <WithDevice device={device} {...props} />;
}
