import { clipStroke } from './area-context';
import { Gesture } from 'react-native-gesture-handler';
import type { ShellyArea } from '@smarteverything/domain';
import { paintArea, strokeSegment, type GridCell } from './area-geometry';
import { pointerCell, type PainterViewport } from './painter-viewport';

export interface PainterGestureInput {
  readonly area: ShellyArea;
  readonly allowed: ShellyArea | undefined;
  readonly tool: 'paint' | 'erase' | 'select';
  readonly width: number;
  readonly viewport: PainterViewport;
  readonly disabled: boolean;
  readonly change: (value: ShellyArea) => void;
  readonly cursor: (value: GridCell) => void;
  readonly preview: (value: ShellyArea) => void;
}

export function painterGesture(input: PainterGestureInput): ReturnType<typeof Gesture.Pan> {
  const cell = (x: number, y: number): GridCell => pointerCell(x, y, input.width, input.viewport);
  return Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .enabled(!input.disabled && input.width > 0)
    .onBegin((event) => {
      input.cursor(cell(event.x, event.y));
    })
    .onUpdate((event) => {
      input.preview(
        clipStroke(
          strokeSegment(
            cell(event.x - event.translationX, event.y - event.translationY),
            cell(event.x, event.y),
          ),
          input.tool === 'erase' ? undefined : input.allowed,
        ),
      );
    })
    .onEnd((event) => {
      const end = cell(event.x, event.y);
      if (input.tool !== 'select')
        input.change(
          clipStroke(
            strokeSegment(cell(event.x - event.translationX, event.y - event.translationY), end),
            input.tool === 'erase' ? undefined : input.allowed,
          ).reduce((area, stroke) => paintArea(area, stroke, input.tool === 'erase'), input.area),
        );
      input.cursor(end);
    })
    .onFinalize(() => {
      input.preview([]);
    });
}
