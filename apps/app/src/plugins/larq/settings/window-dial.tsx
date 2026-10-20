import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, Path } from 'react-native-svg';
import { angleAt, polar } from '../../../components/charts/arc';
import { arcPath } from '../../../components/charts/geometry';
import { useColour } from '../../../design/colour';
import { selectionTick } from '../../../platform/haptics';
import {
  angleOfMinutes,
  minutesAtAngle,
  minutesOfClock,
  moved,
  nearestHandle,
  sweepOf,
  type Handle,
  type Window,
} from '../model/settings-model';
import { ChartLabel } from '../charts/chart-label';

const THICKNESS = 14;
const THUMB = 13;
const HOURS = [0, 6, 12, 18] as const;
const HOUR_LABEL = 28;

export interface DialWindow {
  readonly window: Window | null;
  readonly role: 'info' | 'viz-violet';
  readonly label: string;
}

interface WindowDialProps {
  readonly size: number;
  readonly windows: readonly DialWindow[];
  readonly editing: number;
  readonly onCommit: (window: Window) => void;
}

function Arcs({
  size,
  windows,
}: {
  readonly size: number;
  readonly windows: readonly DialWindow[];
}): ReactNode {
  const track = useColour('surface-3');
  const info = useColour('info');
  const violet = useColour('viz-violet');
  const colours = { info, 'viz-violet': violet } as const;
  const centre = size / 2;
  const ring = { cx: centre, cy: centre, r: (size - THICKNESS) / 2 };
  return (
    <>
      <Circle
        cx={centre}
        cy={centre}
        r={ring.r}
        fill="none"
        stroke={track}
        strokeWidth={THICKNESS}
      />
      {windows.map((entry) => {
        if (entry.window === null) {
          return null;
        }
        const { start, sweep } = sweepOf(entry.window);
        return (
          <Path
            key={entry.label}
            d={arcPath(ring, start, start + Math.min(sweep, 359.9))}
            fill="none"
            stroke={colours[entry.role]}
            strokeWidth={THICKNESS}
            strokeLinecap="round"
          />
        );
      })}
    </>
  );
}

function Face({ size }: { readonly size: number }): ReactNode {
  const centre = size / 2;
  return HOURS.map((hour) => {
    const at = polar(centre, centre - THICKNESS - 12, angleOfMinutes(hour * 60));
    return (
      <ChartLabel
        key={hour}
        left={at.x - HOUR_LABEL / 2}
        top={at.y - 8}
        width={HOUR_LABEL}
        text={String(hour).padStart(2, '0')}
        align="center"
        tone="variant"
      />
    );
  });
}

function Thumbs({
  size,
  window,
  role,
}: {
  readonly size: number;
  readonly window: Window;
  readonly role: DialWindow['role'];
}): ReactNode {
  const fill = useColour(role);
  const ring = useColour('surface-1');
  const centre = size / 2;
  const radius = (size - THICKNESS) / 2;
  return (['from', 'to'] as const).map((handle) => {
    const at = polar(centre, radius, angleOfMinutes(minutesOfClock(window[handle])));
    return (
      <Circle
        key={handle}
        cx={at.x}
        cy={at.y}
        r={THUMB}
        fill={fill}
        stroke={ring}
        strokeWidth={3}
      />
    );
  });
}

interface Drag {
  readonly draft: Window | null;
  readonly pan: ReturnType<typeof Gesture.Pan>;
}

function useDrag(size: number, active: Window | null, onCommit: (window: Window) => void): Drag {
  const [draft, setDraft] = useState<Window | null>(null);
  const [handle, setHandle] = useState<Handle>('from');
  const touch = (
    point: { readonly x: number; readonly y: number },
    chosen: Handle | null,
  ): Window | null => {
    if (active === null) {
      return null;
    }
    const minutes = minutesAtAngle(angleAt(size / 2, point));
    const which = chosen ?? nearestHandle(active, minutes);
    setHandle(which);
    return moved(draft ?? active, which, minutes);
  };
  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin((point) => {
      setDraft(touch(point, null));
    })
    .onUpdate((point) => {
      setDraft(touch(point, handle));
    })
    .onFinalize((point) => {
      const next = touch(point, handle);
      setDraft(null);
      if (
        next !== null &&
        active !== null &&
        (next.from !== active.from || next.to !== active.to)
      ) {
        selectionTick();
        onCommit(next);
      }
    });
  return { draft, pan };
}

export function WindowDial({ size, windows, editing, onCommit }: WindowDialProps): ReactNode {
  const active = windows[editing]?.window ?? null;
  const { draft, pan } = useDrag(size, active, onCommit);
  const shown = draft ?? active;
  const drawn = windows.map((entry, index) =>
    index === editing && draft !== null ? { ...entry, window: draft } : entry,
  );
  const frame = { width: size, height: size };
  return (
    <GestureDetector gesture={pan}>
      <View aria-hidden style={frame}>
        <Svg width={size} height={size}>
          <Arcs size={size} windows={drawn} />
          {shown === null ? null : (
            <Thumbs size={size} window={shown} role={windows[editing]?.role ?? 'info'} />
          )}
        </Svg>
        <Face size={size} />
      </View>
    </GestureDetector>
  );
}
