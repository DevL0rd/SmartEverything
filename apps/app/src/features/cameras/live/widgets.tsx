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
import { CameraTile } from './camera-tile';

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

function CameraWidget({
  options,
  editing,
  size,
}: {
  readonly options: unknown;
  readonly editing: boolean;
  readonly size: WidgetSize;
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
            size={size}
          />
        </View>
      </WidgetSurface>
    );
  }
  return <CameraTile entry={entry} live={!editing && entries.length <= LIVE_TILES_AT_MOST} />;
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
    <WidgetFrame
      title="Latest events"
      icon="film"
      accent="critical"
      href={href.cameraEvents()}
      size={size}
    >
      <View
        className={grid ? 'flex-1 overflow-hidden' : '-mx-card-pad flex-1 overflow-hidden'}
        pointerEvents={editing ? 'none' : 'auto'}
      >
        <RecentEventsBody cameras={entries} limit={grid ? 12 : 4} layout={grid ? 'grid' : 'list'} />
      </View>
    </WidgetFrame>
  );
}

const ALL_SIZES: readonly WidgetSize[] = ['S', 'M', 'L', 'W'];

export const CAMERA_WIDGETS: readonly WidgetDefinition[] = [
  {
    type: 'camera',
    title: 'Camera',
    icon: 'cameras',
    group: 'Cameras',
    aspect: 16 / 9,
    sizes: { compact: ['M', 'S'], medium: ALL_SIZES, expanded: ALL_SIZES },
    defaultSize: 'M',
    instanceOptions: {
      schema: CAMERA_OPTIONS,
      editor: ({ value, onChange }) => <CameraEditor value={value} onChange={onChange} />,
    },
    render: ({ options, editing, size }) => (
      <CameraWidget options={options} editing={editing} size={size} />
    ),
  },
  {
    type: 'camera-events',
    title: 'Latest events',
    icon: 'film',
    group: 'Cameras',
    sizes: { compact: ['L'], medium: ['XL', 'L'], expanded: ['XL', 'L'] },
    defaultSize: 'L',
    render: ({ size, editing }) => <EventsWidget size={size} editing={editing} />,
  },
];

function cameraSize(count: number, board: 'compact' | 'medium' | 'expanded'): WidgetSize {
  if (board === 'compact') {
    return 'M';
  }
  return board === 'expanded' && count > 4 ? 'S' : 'M';
}

function arrangement(
  entries: readonly CameraEntry[],
  board: 'compact' | 'medium' | 'expanded',
): readonly BoardWidget[] {
  return [
    ...entries.map((entry) => ({
      key: `camera:${entry.device.id}`,
      type: 'camera',
      size: cameraSize(entries.length, board),
      options: { deviceId: entry.device.id },
    })),
    { key: 'camera-events', type: 'camera-events', size: board === 'compact' ? 'L' : 'XL' },
  ];
}

export function cameraDefaults(entries: readonly CameraEntry[]): BoardDefaults {
  return {
    compact: arrangement(entries, 'compact'),
    medium: arrangement(entries, 'medium'),
    expanded: arrangement(entries, 'expanded'),
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
