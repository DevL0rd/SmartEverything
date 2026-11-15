import type { DOMProps } from 'expo/dom';
import type { PhotoBox } from '@smarteverything/domain';
import type { CanvasView } from './canvas-view';

export const CANVAS_STATUSES = ['failed', 'lost', 'no-webgl'] as const;

export type CanvasStatus = (typeof CANVAS_STATUSES)[number];

export interface CanvasPatch {
  readonly box: PhotoBox;
  readonly uri: string;
}

export interface CanvasGrid {
  readonly columns: number;
  readonly gap: number;
  readonly rowGap: number;
}

export const SINGLE_VIEW: CanvasGrid = { columns: 1, gap: 0, rowGap: 0 };

export interface PhotoCanvasProps {
  readonly uri: string;
  readonly patches: readonly CanvasPatch[];
  readonly views: readonly CanvasView[];
  readonly grid: CanvasGrid;
  readonly label: string;
  readonly onStatus: (status: CanvasStatus, detail: string) => Promise<void>;
  readonly onLoaded: (width: number, height: number) => Promise<void>;
  readonly dom?: DOMProps;
}
