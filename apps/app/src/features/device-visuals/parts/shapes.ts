import { formatPoint, pointOn } from '../../../components/charts/geometry';

export { arcPath, circlePath, type Ring } from '../../../components/charts/geometry';

const CENTRE = 50;

function point(r: number, degrees: number): string {
  return formatPoint(pointOn({ cx: CENTRE, cy: CENTRE, r }, degrees));
}

export function bladesPath(count: number, radius: number, hub: number, curve = 26): string {
  const step = 360 / count;
  return Array.from({ length: count }, (_, index) => {
    const angle = index * step;
    const tip = point(radius, angle + curve * 0.35);
    const lead = point(radius * 0.72, angle + curve);
    const back = point(radius * 0.55, angle - step * 0.12);
    const root = point(hub, angle - step * 0.25);
    const rootEnd = point(hub, angle + step * 0.25);
    return `M${root} Q${back} ${tip} Q${lead} ${rootEnd} Z`;
  }).join(' ');
}

export interface Bounds {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly r: number;
}

export function rounded(bounds: Bounds): string {
  const { x, y, w, h } = bounds;
  const r = Math.min(bounds.r, w / 2, h / 2);
  const n = (value: number): string => String(Math.round(value * 100) / 100);
  return [
    `M${n(x + r)} ${n(y)}`,
    `H${n(x + w - r)}`,
    `A${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)}`,
    `V${n(y + h - r)}`,
    `A${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(y + h)}`,
    `H${n(x + r)}`,
    `A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + h - r)}`,
    `V${n(y + r)}`,
    `A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}`,
    'Z',
  ].join(' ');
}

export function spinPeriod(level: number, slowest: number, fastest: number): number {
  const share = Math.min(1, Math.max(0, (level - 0.1) / 0.9));
  return Math.round(slowest - share * (slowest - fastest));
}

export function questionPath(cx: number, cy: number, size: number): string {
  const n = (value: number): string => String(Math.round(value * 100) / 100);
  const left = n(cx - 0.55 * size);
  const right = n(cx + 0.55 * size);
  const top = n(cy - 1.2 * size);
  const mid = n(cy - 0.5 * size);
  return [
    `M${left} ${mid}`,
    `C${left} ${top} ${right} ${top} ${right} ${mid}`,
    `C${right} ${n(cy - 0.05 * size)} ${n(cx)} ${n(cy - 0.1 * size)} ${n(cx)} ${n(cy + 0.4 * size)}`,
    `M${n(cx)} ${n(cy + 0.95 * size)}V${n(cy + 0.96 * size)}`,
  ].join(' ');
}
