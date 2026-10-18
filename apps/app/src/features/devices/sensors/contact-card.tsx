import type { ReactNode } from 'react';
import { View } from 'react-native';
import { withRole } from '@smarteverything/domain';
import { StateTimeline } from '../../../components/charts';
import { ReasonLine } from '../../../components/reason-line';
import { Text } from '../../../components/text';
import { useDeviceDerived } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import type { CardFaceProps } from '../card/card-face';
import { GenericCardFace } from '../card/generic-card-face';
import { isWideClass, type WideClass } from '../card/wide-card';
import { usePowerTimeline } from '../button/use-power-timeline';
import { deviceModelOf } from '../model/device-model';
import { OFFLINE_REASON } from '../model/offline';
import { contactStateText, openingsText, openingsToday, openSince } from './contact-model';
import { levelPercent, numberAt } from './reading';
import { SensorFrame, VisibleRoot } from './sensor-frame';
import { levelPill } from './state-line';

const STRIP_HEIGHT = 28;
const PANEL_STRIP_HEIGHT = 48;

interface ContactRead {
  readonly open: boolean | null;
  readonly battery: number | null;
}

function useContactRead(device: Device): ContactRead {
  const presentation = deviceModelOf(device).presentation;
  const contact = withRole(presentation, 'contact');
  const battery = withRole(presentation, 'battery');
  return useDeviceDerived(
    device.id,
    (values) => {
      const flag = contact === undefined ? undefined : values[contact.key]?.value;
      return {
        open: typeof flag === 'boolean' ? flag : null,
        battery:
          battery === undefined
            ? null
            : levelPercent(battery.capability, numberAt(values, battery.key)),
      };
    },
    [contact, battery],
  );
}

function ContactStrip({
  timeline,
  height,
}: {
  readonly timeline: ReturnType<typeof usePowerTimeline>;
  readonly height: number;
}): ReactNode {
  return (
    <StateTimeline
      segments={timeline.segments}
      colours={{ on: 'warning' }}
      label="Open in the last 24 hours"
      height={height}
      from={timeline.from}
      to={timeline.to}
      captions={['24 h ago', 'Now']}
      empty="No data yet"
      track="surface-2"
    />
  );
}

function figuresOf(cls: WideClass, count: number, battery: number | null): readonly ReactNode[] {
  return [
    <Text key="count" variant="footnote" tone="variant" numberOfLines={1}>
      {openingsText(count, cls === 'm')}
    </Text>,
    ...(battery === null ? [] : [levelPill(null, battery)]),
  ];
}

function factsOf(line: string, count: number, battery: number | null): readonly string[] {
  return [
    line,
    openingsText(count, false),
    ...(battery === null ? [] : [`Battery ${String(Math.round(battery))} percent`]),
  ];
}

function WideContact({
  device,
  cls,
  live,
  contactKey,
}: {
  readonly device: Device;
  readonly cls: WideClass;
  readonly live: boolean;
  readonly contactKey: string;
}): ReactNode {
  const read = useContactRead(device);
  const timeline = usePowerTimeline(device.id, contactKey, live);
  const offline = !device.online;
  const count = openingsToday(timeline.segments, timeline);
  const line = contactStateText(read.open, openSince(timeline.segments, timeline, read.open));
  const strip = (
    <ContactStrip
      timeline={timeline}
      height={cls === 'l' || cls === 'xl' ? PANEL_STRIP_HEIGHT : STRIP_HEIGHT}
    />
  );
  return (
    <SensorFrame
      device={device}
      cls={cls}
      live={live}
      line={line}
      tone={read.open === true && !offline ? 'warning' : 'variant'}
      offline={offline}
      facts={factsOf(line, count, read.battery)}
      figures={figuresOf(cls, count, read.battery)}
      graph={offline ? <View className="opacity-60">{strip}</View> : strip}
      actions={offline ? [<ReasonLine key="why" icon="wifi" text={OFFLINE_REASON} />] : []}
    />
  );
}

export function ContactSensorCard(props: CardFaceProps): ReactNode {
  const contact = withRole(deviceModelOf(props.device).presentation, 'contact');
  const { device, cls } = props;
  return isWideClass(cls) && contact !== undefined ? (
    <VisibleRoot>
      {(live) => <WideContact device={device} cls={cls} live={live} contactKey={contact.key} />}
    </VisibleRoot>
  ) : (
    <GenericCardFace {...props} />
  );
}
