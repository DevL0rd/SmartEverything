import type { ReactNode } from 'react';
import { View } from 'react-native';
import { z } from 'zod';
import { href } from '../../../app-shell/hrefs';
import {
  WidgetEmpty,
  WidgetFrame,
  WidgetSurface,
  type BoardDefaults,
  type BoardWidget,
  type WidgetDefinition,
  type WidgetSize,
} from '../../../components/widget-board';
import { Select } from '../../../components/select';
import { RecentEventsBody } from '../components/recent-events';
import { useCameraEntries } from '../data/use-cameras';
import type { CameraEntry } from '../logic/cameras';
import { useCameraCondition } from '../data/use-camera-condition';
import { CameraTile } from './camera-tile';
import { CameraUnreachable } from './camera-unreachable';

export const CAMERAS_PAGE = 'cameras';

const LIVE_TILES_AT_MOST = 4;

const CAMERA_OPTIONS = z.object({ deviceId: z.string().min(1) });

type CameraOptions = z.infer<typeof CAMERA_OPTIONS>;

function cameraOf(entries: readonly CameraEntry[], options: unknown): CameraEntry | null {
  const parsed = CAMERA_OPTIONS.safeParse(options);
  return parsed.success
    ? (entries.find((entry) => entry.device.id === parsed.data.deviceId) ?? null)
    : null;
}

function CameraFace({
  entry,
  live,
}: {
  readonly entry: CameraEntry;
  readonly live: boolean;
}): ReactNode {
  const condition = useCameraCondition(entry);
  return condition.online ? (
    <CameraTile entry={entry} live={live} condition={condition} />
  ) : (
    <CameraUnreachable entry={entry} lastSeen={condition.lastSeen} />
  );
}

function CameraWidget({
  options,
  editing,
}: {
  readonly options: unknown;
  readonly editing: boolean;
}): ReactNode {
  const entries = useCameraEntries();
  const entry = cameraOf(entries, options);
  if (entry === null) {
    return (
      <WidgetSurface>
        <View className="flex-1 p-card-pad">
          <WidgetEmpty
            icon="cameras"
            colour="primary"
            title="Choose a camera"
            body="Pick one in this tile’s options."
          />
        </View>
      </WidgetSurface>
    );
  }
  return <CameraFace entry={entry} live={!editing && entries.length <= LIVE_TILES_AT_MOST} />;
}

function CameraEditor({
  value,
  onChange,
}: {
  readonly value: unknown;
  readonly onChange: (value: CameraOptions) => void;
}): ReactNode {
  const entries = useCameraEntries();
  const chosen = CAMERA_OPTIONS.safeParse(value);
  return (
    <Select
      label="Camera"
      options={entries.map((entry) => ({ value: entry.device.id, label: entry.name }))}
      value={chosen.success ? chosen.data.deviceId : null}
      placeholder="Choose a camera"
      onChange={(deviceId) => {
        onChange({ deviceId });
      }}
    />
  );
}

function EventsWidget({
  size,
  editing,
}: {
  readonly size: WidgetSize;
  readonly editing: boolean;
}): ReactNode {
  const entries = useCameraEntries();
  const grid = size === 'XL';
  return (
    <WidgetFrame title="Latest events" icon="film" accent="critical" href={href.cameraEvents()}>
      <View
        className={grid ? 'flex-1 overflow-hidden' : '-mx-card-pad flex-1 overflow-hidden'}
        pointerEvents={editing ? 'none' : 'auto'}
      >
        <RecentEventsBody cameras={entries} limit={grid ? 12 : 4} layout={grid ? 'grid' : 'list'} />
      </View>
    </WidgetFrame>
  );
}

const ALL_SIZES: readonly WidgetSize[] = ['M', 'W'];

export const CAMERA_WIDGETS: readonly WidgetDefinition[] = [
  {
    type: 'camera',
    title: 'Camera',
    icon: 'cameras',
    group: 'Cameras',
    aspect: 16 / 9,
    sizes: { compact: ['M'], medium: ALL_SIZES, expanded: ALL_SIZES },
    defaultSize: 'M',
    instanceOptions: {
      schema: CAMERA_OPTIONS,
      editor: ({ value, onChange }) => <CameraEditor value={value} onChange={onChange} />,
    },
    render: ({ options, editing }) => <CameraWidget options={options} editing={editing} />,
  },
  {
    type: 'camera-events',
    title: 'Latest events',
    icon: 'film',
    group: 'Cameras',
    sizes: { compact: ['XL'], medium: ['XL'], expanded: ['XL'] },
    defaultSize: 'XL',
    render: ({ size, editing }) => <EventsWidget size={size} editing={editing} />,
  },
];

function arrangement(entries: readonly CameraEntry[]): readonly BoardWidget[] {
  return [
    ...entries.map((entry) => ({
      key: `camera:${entry.device.id}`,
      type: 'camera',
      size: 'M' as const,
      options: { deviceId: entry.device.id },
    })),
    { key: 'camera-events', type: 'camera-events', size: 'XL' as const },
  ];
}

export function cameraDefaults(entries: readonly CameraEntry[]): BoardDefaults {
  return {
    compact: arrangement(entries),
    medium: arrangement(entries),
    expanded: arrangement(entries),
  };
}

export function cameraInstanceAvailable(
  entries: readonly CameraEntry[],
): (widget: BoardWidget) => boolean {
  return (widget) =>
    widget.type !== 'camera' ||
    widget.options === undefined ||
    cameraOf(entries, widget.options) !== null;
}
