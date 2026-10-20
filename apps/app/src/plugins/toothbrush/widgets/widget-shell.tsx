import type { BrushStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import type { IconName } from '../../../components/icon';
import { Skeleton } from '../../../components/skeleton';
import { WidgetEmpty, WidgetFrame } from '../../../components/widget-board';
import { useIsOwner } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { useBrushDemand, useBrushState } from '../data/brush-data';
import { useBrushDevice } from '../data/use-brush-device';

interface Props {
  readonly title: string;
  readonly icon: IconName;
  readonly live?: boolean;
  readonly children: (device: Device, view: BrushStateView) => ReactNode;
}

function Waiting(): ReactNode {
  return (
    <View aria-hidden className="gap-3">
      <Skeleton shape="text" />
      <Skeleton shape="block" className="h-12" />
    </View>
  );
}

function NoBrush(props: Pick<Props, 'title' | 'icon'>): ReactNode {
  const owner = useIsOwner();
  return (
    <WidgetFrame title={props.title} icon={props.icon} accent="primary">
      <WidgetEmpty
        icon="toothbrush"
        colour="primary"
        title="No toothbrush yet"
        body={owner ? 'Add a toothbrush to see it here.' : 'Ask the owner to add the toothbrush.'}
        {...(owner ? { action: { label: 'Add toothbrush', href: href.connect('sonicare') } } : {})}
      />
    </WidgetFrame>
  );
}

function WithDevice({ device, ...props }: Props & { readonly device: Device }): ReactNode {
  const state = useBrushState(device.id);
  useBrushDemand(device.id, props.live !== false);
  const view = state.data;
  return (
    <WidgetFrame title={props.title} icon={props.icon} accent="primary" href={href.device(device)}>
      {view === undefined ? <Waiting /> : props.children(device, view)}
    </WidgetFrame>
  );
}

export function BrushWidgetShell(props: Props): ReactNode {
  const device = useBrushDevice();
  return device === null ? <NoBrush {...props} /> : <WithDevice device={device} {...props} />;
}
