import type { ReactNode } from 'react';
import { z } from 'zod';
import { Select } from '../../../components/select';
import {
  WidgetEmpty,
  WidgetFrame,
  type BoardClass,
  type BoardWidget,
  type WidgetDefinition,
  type WidgetSize,
} from '../../../components/widget-board';
import { useDevices } from '../../../store/selectors';
import { DeviceSpotlightWidget } from '../../devices';
import { spotlightable } from '../model/spotlight';

const SPOTLIGHT_OPTIONS = z.object({ deviceId: z.string().min(1) });

type SpotlightOptions = z.infer<typeof SPOTLIGHT_OPTIONS>;

const SIZES: readonly WidgetSize[] = ['S', 'M', 'L', 'W'];

const EVERY_CLASS: Readonly<Record<BoardClass, readonly WidgetSize[]>> = {
  compact: SIZES,
  medium: SIZES,
  expanded: SIZES,
};

function SpotlightEditor({
  value,
  onChange,
}: {
  readonly value: SpotlightOptions;
  readonly onChange: (value: SpotlightOptions) => void;
}): ReactNode {
  const devices = useDevices().filter(spotlightable);
  return (
    <Select
      label="Device"
      options={devices.map((device) => ({ value: device.id, label: device.label }))}
      value={value.deviceId}
      onChange={(deviceId) => {
        onChange({ deviceId });
      }}
    />
  );
}

function NoDevice({ size }: { readonly size: WidgetSize }): ReactNode {
  return (
    <WidgetFrame title="Device" icon="cpu" accent="primary" size={size}>
      <WidgetEmpty
        icon="cpu"
        colour="warning"
        title="Choose a device"
        body="Pick one in this card’s options."
        size={size}
      />
    </WidgetFrame>
  );
}

export function spotlightOf(widget: BoardWidget): string | null {
  if (widget.type !== 'spotlight') {
    return null;
  }
  const options = SPOTLIGHT_OPTIONS.safeParse(widget.options);
  return options.success ? options.data.deviceId : null;
}

export const SPOTLIGHT_WIDGET: WidgetDefinition = {
  type: 'spotlight',
  title: 'Device',
  icon: 'sparkles',
  group: 'Devices',
  sizes: EVERY_CLASS,
  defaultSize: 'M',
  instanceOptions: {
    schema: SPOTLIGHT_OPTIONS,
    editor: ({ value, onChange }) => (
      <SpotlightEditor value={SPOTLIGHT_OPTIONS.parse(value)} onChange={onChange} />
    ),
  },
  render: ({ size, options, editing }) => {
    const parsed = SPOTLIGHT_OPTIONS.safeParse(options);
    return parsed.success ? (
      <DeviceSpotlightWidget deviceId={parsed.data.deviceId} size={size} editing={editing} />
    ) : (
      <NoDevice size={size} />
    );
  },
};
