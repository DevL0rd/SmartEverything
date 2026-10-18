import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../app-shell/hrefs';
import { Banner } from '../../components/banner';
import { Button } from '../../components/button';
import type { IconName } from '../../components/icon';
import { Skeleton } from '../../components/skeleton';
import { WidgetEmpty, WidgetFrame } from '../../components/widget-board';
import { useWidgetFace } from '../../components/widget-board/use-widget-face';
import { useWidgetActions } from '../../components/widget-board/widget-scope';
import type { ColourRole } from '../../design/tokens';
import { useMinute } from '../../store/clock';
import { useIsOwner } from '../../store/selectors';
import type { Device } from '../../store/state';
import { usePluginDevice } from './use-plugin-device';
import { usePluginOff } from './use-plugin-off';
import type { PluginStream } from './use-plugin-stream';

export interface ServiceReady<T> {
  readonly snapshot: T;
  readonly device: Device;
  readonly now: number;
}

export interface ServiceWidget<T> {
  readonly pluginId: string;
  readonly deviceKind: string;
  readonly useSnapshot: () => PluginStream<T>;
  readonly offTitle: string;
  readonly setUpTitle: string;
  readonly setUpIcon: IconName;
  readonly hideRemoveWhenSmall: boolean;
}

interface ServiceWidgetFrameProps<T> {
  readonly service: ServiceWidget<T>;
  readonly title: string;
  readonly icon: IconName;
  readonly accent: ColourRole;
  readonly action?: (ready: ServiceReady<T>) => ReactNode;
  readonly children: (ready: ServiceReady<T>) => ReactNode;
}

export function Waiting(): ReactNode {
  return (
    <View aria-hidden className="gap-3">
      <Skeleton shape="text" />
      <Skeleton shape="block" className="h-12" />
    </View>
  );
}

function PluginOff({
  title,
  hideRemoveWhenSmall,
}: {
  readonly title: string;
  readonly hideRemoveWhenSmall: boolean;
}): ReactNode {
  const owner = useIsOwner();
  const actions = useWidgetActions();
  const { cls } = useWidgetFace();
  const removable = actions !== null && !(hideRemoveWhenSmall && cls === 's');
  return (
    <View className="flex-1 gap-1">
      <WidgetEmpty
        icon="puzzle"
        colour="on-surface-variant"
        title={title}
        body={owner ? 'Turn it on again or remove this widget.' : 'Ask the owner to turn it on.'}
        {...(owner
          ? { action: { label: 'Open plugins', href: href.settings.page('plugins') } }
          : {})}
      />
      {removable ? (
        <View className="items-start">
          <Button label="Remove widget" variant="text" onPress={actions.remove} />
        </View>
      ) : null}
    </View>
  );
}

function NotSetUp({
  pluginId,
  title,
  icon,
}: {
  readonly pluginId: string;
  readonly title: string;
  readonly icon: IconName;
}): ReactNode {
  const owner = useIsOwner();
  return (
    <WidgetEmpty
      icon={icon}
      colour="primary"
      title={title}
      body={owner ? 'Connect it in settings to see it here.' : 'Ask the owner to connect it.'}
      {...(owner
        ? { action: { label: 'Open settings', href: href.pluginSettings(pluginId) } }
        : {})}
    />
  );
}

function Problem<T>({
  stream,
  service,
}: {
  readonly stream: PluginStream<T>;
  readonly service: ServiceWidget<T>;
}): ReactNode {
  switch (stream.state) {
    case 'waiting':
      return <Waiting />;
    case 'invalid':
      return <Banner tone="critical" title="This widget could not read the latest data" wrapBody />;
    case 'ready':
      return (
        <NotSetUp pluginId={service.pluginId} title={service.setUpTitle} icon={service.setUpIcon} />
      );
  }
}

function readyOf<T extends { readonly connection: { readonly state: string } }>(
  stream: PluginStream<T>,
  device: Device | null,
  now: number,
): ServiceReady<T> | null {
  return stream.state === 'ready' &&
    stream.value.connection.state !== 'not_set_up' &&
    device !== null
    ? { snapshot: stream.value, device, now }
    : null;
}

export function ServiceWidgetFrame<T extends { readonly connection: { readonly state: string } }>({
  service,
  title,
  icon,
  accent,
  action,
  children,
}: ServiceWidgetFrameProps<T>): ReactNode {
  const stream = service.useSnapshot();
  const device = usePluginDevice(service.deviceKind);
  const off = usePluginOff(service.pluginId);
  const now = useMinute();
  const ready = off ? null : readyOf(stream, device, now);
  const link = device === null ? {} : { href: href.device(device) };
  const body = off ? (
    <PluginOff title={service.offTitle} hideRemoveWhenSmall={service.hideRemoveWhenSmall} />
  ) : ready === null ? (
    <Problem stream={stream} service={service} />
  ) : (
    children(ready)
  );
  return (
    <WidgetFrame
      title={title}
      icon={icon}
      accent={accent}
      action={ready === null || action === undefined ? undefined : action(ready)}
      {...link}
    >
      {body}
    </WidgetFrame>
  );
}
