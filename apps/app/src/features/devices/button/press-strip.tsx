import type { ReactNode } from 'react';
import { StateTimeline } from '../../../components/charts';
import type { ColourRole } from '../../../design/tokens';
import type { ButtonGesture } from '../../device-visuals';
import type { PressSegment, PressWindow } from './press-model';

const GESTURE_COLOURS: Readonly<Record<ButtonGesture, ColourRole>> = {
  single: 'primary',
  double: 'info',
  long: 'warning',
};

const HOURS_AGO = '24 h ago';
const NOW = 'Now';

export function PressStrip({
  segments,
  window,
  height = 14,
}: {
  readonly segments: readonly PressSegment[];
  readonly window: PressWindow;
  readonly height?: number;
}): ReactNode {
  return (
    <StateTimeline
      segments={segments}
      colours={GESTURE_COLOURS}
      label={`Presses in the last 24 hours: ${String(segments.length)}`}
      height={height}
      from={window.from}
      to={window.to}
      captions={[HOURS_AGO, NOW]}
      empty="No presses yet"
      track="surface-2"
    />
  );
}
