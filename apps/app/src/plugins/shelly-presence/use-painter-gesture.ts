import { commitStroke, strokeRejected, toolStroke, type PainterTool } from './area-context';
import { Gesture } from 'react-native-gesture-handler';
import type { ShellyArea } from '@smarteverything/shelly';
import type { GridCell } from './area-geometry';
import { pointerCell, type PainterViewport } from './painter-viewport';

export interface PainterGestureInput {
  readonly area: ShellyArea;
  readonly allowed: ShellyArea | undefined;
  readonly tool: PainterTool;
  readonly width: number;
  readonly viewport: PainterViewport;
  readonly disabled: boolean;
  readonly change: (value: ShellyArea) => void;
  readonly cursor: (value: GridCell) => void;
  readonly preview: (value: ShellyArea) => void;
  readonly rejected: (value: boolean) => void;
}

export function painterGesture(input: PainterGestureInput): ReturnType<typeof Gesture.Pan> {
  const cell = (x: number, y: number): GridCell => pointerCell(x, y, input.width, input.viewport);
  const origin = (event: {
    readonly x: number;
    readonly y: number;
    readonly translationX: number;
    readonly translationY: number;
  }): GridCell => cell(event.x - event.translationX, event.y - event.translationY);
  return Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .enabled(!input.disabled && input.width > 0)
    .onBegin((event) => {
      input.rejected(false);
      input.cursor(cell(event.x, event.y));
    })
    .onUpdate((event) => {
      input.preview(toolStroke(input.tool, origin(event), cell(event.x, event.y), input.allowed));
    })
    .onEnd((event) => {
      const end = cell(event.x, event.y);
      const strokes = toolStroke(input.tool, origin(event), end, input.allowed);
      input.rejected(strokeRejected(input.tool, strokes));
      if (strokes.length > 0) input.change(commitStroke(input.area, input.tool, strokes));
      input.cursor(end);
    })
    .onFinalize(() => {
      input.preview([]);
    });
}
