import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../app-shell/hrefs';
import { Banner } from '../../components/banner';
import { Button } from '../../components/button';
import type { FigureSize } from '../../components/figure';
import type { IconName } from '../../components/icon';
import { IconButton } from '../../components/icon-button';
import { IconWell } from '../../components/icon-well';
import { Skeleton } from '../../components/skeleton';
import { Text } from '../../components/text';
import {
  frameClassOf,
  WidgetFrame,
  widgetBodyHeight,
  type FrameClass,
  type WidgetFrameBox,
} from '../../components/widget-board';
import { useWidgetFace } from '../../components/widget-board/use-widget-face';
import { useWidgetActions } from '../../components/widget-board/widget-scope';
import { cn } from '../../design/cn';
import { TYPE_SCALE, type ColourRole, type Idiom } from '../../design/tokens';
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

export type ServiceFace = 'tile' | 'compact' | 'tall' | 'wide' | 'wide-tall';

export interface ServiceLayout {
  readonly face: ServiceFace;
  readonly room: number;
  readonly idiom: Idiom;
}

const FACES: Readonly<Record<FrameClass, ServiceFace>> = {
  xs: 'compact',
  s: 'tile',
  m: 'compact',
  l: 'tall',
  w: 'wide',
  xl: 'wide-tall',
};

export function serviceLayoutOf(
  frame: WidgetFrameBox,
  controlHeight: number,
  banded: boolean,
): ServiceLayout {
  const band = banded ? controlHeight : 0;
  return {
    face: FACES[frameClassOf(frame)],
    room: Math.max(0, widgetBodyHeight(frame) - band),
    idiom: frame.idiom,
  };
}

export interface FigureFit {
  readonly figure: Exclude<FigureSize, 'xl'>;
  readonly caption: 'footnote' | 'caption';
  readonly gap: 'gap-1' | 'gap-0.5' | 'gap-0';
}

const GAP_PX: Readonly<Record<FigureFit['gap'], number>> = {
  'gap-1': 4,
  'gap-0.5': 2,
  'gap-0': 0,
};

const TIGHT_FIT: FigureFit = { figure: 's', caption: 'caption', gap: 'gap-0' };

const FIGURE_FITS: readonly FigureFit[] = [
  { figure: 'l', caption: 'footnote', gap: 'gap-1' },
  { figure: 'm', caption: 'footnote', gap: 'gap-1' },
  { figure: 's', caption: 'footnote', gap: 'gap-0.5' },
  TIGHT_FIT,
];

export function figureFitOf(room: number, idiom: Idiom): FigureFit {
  const type = TYPE_SCALE[idiom];
  return (
    FIGURE_FITS.find(
      (fit) => type[`figure-${fit.figure}`][1] + GAP_PX[fit.gap] + type[fit.caption][1] <= room,
    ) ?? TIGHT_FIT
  );
}

export const GRAPH_LEAST = 16;

const GRAPH_SPACE = 6;

export function GraphFill({
  least = GRAPH_LEAST,
  spaced = false,
  edge = 'end',
  children,
}: {
  readonly least?: number;
  readonly spaced?: boolean;
  readonly edge?: 'start' | 'end';
  readonly children: (height: number) => ReactNode;
}): ReactNode {
  const [height, setHeight] = useState(0);
  const room = height - (spaced ? GRAPH_SPACE : 0);
  return (
    <View
      className={cn('min-h-0 flex-1', edge === 'end' ? 'justify-end' : 'justify-start')}
      onLayout={(event) => {
        setHeight(Math.floor(event.nativeEvent.layout.height));
      }}
    >
      {room >= least ? <View className={spaced ? 'pt-1.5' : ''}>{children(room)}</View> : null}
    </View>
  );
}

export function Waiting(): ReactNode {
  return (
    <View aria-hidden className="flex-1 gap-3">
      <Skeleton shape="text" />
      <Skeleton shape="block" className="min-h-0 flex-1" />
    </View>
  );
}

type WellSize = 's' | 'm' | 'l';

const WELLS: readonly (readonly [WellSize, number])[] = [
  ['l', 48],
  ['m', 36],
];

export interface NoticeShape {
  readonly well: WellSize;
  readonly titleLines: number;
  readonly bodyLines: number;
}

export function noticeShapeOf(room: number, idiom: Idiom): NoticeShape {
  const title = TYPE_SCALE[idiom].body[1];
  const body = TYPE_SCALE[idiom].footnote[1];
  const titleLines = room >= 2 * title + 2 * body ? 2 : 1;
  return {
    well: WELLS.find(([, px]) => px <= room)?.[0] ?? 's',
    titleLines,
    bodyLines: Math.max(1, Math.floor((room - titleLines * title) / body)),
  };
}

function Notice({
  icon,
  colour,
  title,
  body,
  layout,
}: {
  readonly icon: IconName;
  readonly colour: ColourRole;
  readonly title: string;
  readonly body: string;
  readonly layout: ServiceLayout;
}): ReactNode {
  const shape = noticeShapeOf(layout.room, layout.idiom);
  return (
    <View className="flex-row items-center gap-3">
      <IconWell icon={icon} colour={colour} size={shape.well} />
      <View className="min-w-0 flex-1">
        <Text variant="body-strong" numberOfLines={shape.titleLines}>
          {title}
        </Text>
        <Text variant="footnote" tone="variant" numberOfLines={shape.bodyLines}>
          {body}
        </Text>
      </View>
    </View>
  );
}

interface Shown {
  readonly band: ReactNode;
  readonly body: (layout: ServiceLayout) => ReactNode;
}

function hasBand(band: ReactNode): boolean {
  return band !== undefined && band !== null && band !== false;
}

function offShown(title: string, owner: boolean, remove: (() => void) | null): Shown {
  const band =
    !owner && remove === null ? undefined : (
      <>
        {remove === null ? null : (
          <IconButton icon="trash" label="Remove widget" onPress={remove} />
        )}
        {owner ? (
          <Button label="Open plugins" variant="tonal" href={href.settings.page('plugins')} />
        ) : null}
      </>
    );
  return {
    band,
    body: (layout) => (
      <Notice
        icon="puzzle"
        colour="on-surface-variant"
        title={title}
        body={owner ? 'Turn it on again or remove this widget.' : 'Ask the owner to turn it on.'}
        layout={layout}
      />
    ),
  };
}

function problemShown<T>(
  stream: PluginStream<T>,
  service: ServiceWidget<T>,
  owner: boolean,
): Shown {
  switch (stream.state) {
    case 'waiting':
      return { band: undefined, body: () => <Waiting /> };
    case 'invalid':
      return {
        band: undefined,
        body: () => (
          <Banner tone="critical" title="This widget could not read the latest data" wrapBody />
        ),
      };
    case 'ready':
      return {
        band: owner ? (
          <Button
            label="Open settings"
            variant="tonal"
            href={href.pluginSettings(service.pluginId)}
          />
        ) : undefined,
        body: (layout) => (
          <Notice
            icon={service.setUpIcon}
            colour="primary"
            title={service.setUpTitle}
            body={owner ? 'Connect it in settings to see it here.' : 'Ask the owner to connect it.'}
            layout={layout}
          />
        ),
      };
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

function useRemove(hideWhenSmall: boolean, cls: FrameClass): (() => void) | null {
  const actions = useWidgetActions();
  return actions === null || (hideWhenSmall && cls === 's') ? null : actions.remove;
}

interface ServiceWidgetFrameProps<T> {
  readonly service: ServiceWidget<T>;
  readonly title: string;
  readonly icon: IconName;
  readonly accent: ColourRole;
  readonly actions?: (ready: ServiceReady<T>) => ReactNode;
  readonly children: (ready: ServiceReady<T>, layout: ServiceLayout) => ReactNode;
}

export function ServiceWidgetFrame<T extends { readonly connection: { readonly state: string } }>({
  service,
  title,
  icon,
  accent,
  actions,
  children,
}: ServiceWidgetFrameProps<T>): ReactNode {
  const stream = service.useSnapshot();
  const device = usePluginDevice(service.deviceKind);
  const off = usePluginOff(service.pluginId);
  const now = useMinute();
  const owner = useIsOwner();
  const { frame, cls, sizes } = useWidgetFace();
  const remove = useRemove(service.hideRemoveWhenSmall, cls);
  const ready = off ? null : readyOf(stream, device, now);
  const shown: Shown = off
    ? offShown(service.offTitle, owner, remove)
    : ready === null
      ? problemShown(stream, service, owner)
      : { band: actions?.(ready), body: (layout) => children(ready, layout) };
  const banded = hasBand(shown.band);
  const link = device === null ? {} : { href: href.device(device) };
  return (
    <WidgetFrame
      title={title}
      icon={icon}
      accent={accent}
      actions={banded ? shown.band : undefined}
      {...link}
    >
      {shown.body(serviceLayoutOf(frame, sizes.controlH, banded))}
    </WidgetFrame>
  );
}
