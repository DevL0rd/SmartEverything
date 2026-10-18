import type { SemanticSizes } from '../../../design/tokens';
import type { WidgetFrameBox } from '../../../components/widget-board';

const HEADER_HEIGHT = { touch: 40, pointer: 32 } as const;

const BODY_GAP = 12;

const CHIP_GAP = 8;

const CONSUMER_ROW = 24;

const CONSUMER_GAP = 8;

export const CONSUMERS_SHOWN = 3;

export function bodyHeight({ height, idiom }: WidgetFrameBox): number {
  return height - HEADER_HEIGHT[idiom] - BODY_GAP;
}

export function activityRowCount(body: number, sizes: SemanticSizes, footer: boolean): number {
  const room = footer ? body - sizes.controlH - BODY_GAP : body;
  return Math.max(1, Math.floor(room / sizes.rowH2));
}

export interface SceneGrid {
  readonly shown: number;
  readonly more: number;
}

function chipRows(room: number, chip: number): number {
  return Math.floor((room + CHIP_GAP) / (chip + CHIP_GAP));
}

export function sceneGrid(
  body: number,
  count: number,
  columns: number,
  sizes: SemanticSizes,
): SceneGrid {
  if (Math.ceil(count / columns) <= chipRows(body, sizes.touchMin)) {
    return { shown: count, more: 0 };
  }
  const rows = Math.max(1, chipRows(body - sizes.controlH - BODY_GAP, sizes.touchMin));
  const shown = Math.min(count, rows * columns);
  return { shown, more: count - shown };
}

const SECURITY_ROW = 28;

const SECURITY_GAP = 10;

const MORE_LINE = 20;

export interface SecurityRows {
  readonly shown: number;
  readonly more: number;
}

function securityRows(room: number): number {
  return Math.floor((room + SECURITY_GAP) / (SECURITY_ROW + SECURITY_GAP));
}

export function securityRowCount(body: number, count: number): SecurityRows {
  if (count <= securityRows(body)) {
    return { shown: count, more: 0 };
  }
  const shown = Math.max(1, securityRows(body - MORE_LINE - SECURITY_GAP));
  return { shown, more: count - shown };
}

export function consumerRowCount(body: number, figureHeight: number, available: number): number {
  const room = body - figureHeight - CONSUMER_GAP;
  return Math.min(available, CONSUMERS_SHOWN, Math.max(0, Math.floor(room / CONSUMER_ROW)));
}
