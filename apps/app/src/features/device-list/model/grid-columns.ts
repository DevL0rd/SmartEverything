import { CONTAINER_WIDTH } from '../../../design/tokens';

const MIN_TILE = 320;
const MAX_TILE = 520;

export function contentWidth(measured: number, gutter: number): number {
  return Math.min(measured - 2 * gutter, CONTAINER_WIDTH.dashboard);
}

export function columnsFor(content: number, gap: number): number {
  const widest = Math.ceil((content + gap) / (MAX_TILE + gap));
  const fits = Math.floor((content + gap) / (MIN_TILE + gap));
  return Math.max(1, Math.min(widest, fits));
}
