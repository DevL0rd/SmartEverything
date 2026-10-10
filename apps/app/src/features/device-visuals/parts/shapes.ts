function point(cx: number, cy: number, radius: number, degrees: number): string {
  const radians = (degrees * Math.PI) / 180;
  const x = cx + radius * Math.sin(radians);
  const y = cy - radius * Math.cos(radians);
  return `${x.toFixed(2)} ${y.toFixed(2)}`;
}

export function bladesPath(count: number, radius: number, hub: number, curve = 26): string {
  const step = 360 / count;
  return Array.from({ length: count }, (_, index) => {
    const angle = index * step;
    const tip = point(50, 50, radius, angle + curve * 0.35);
    const lead = point(50, 50, radius * 0.72, angle + curve);
    const back = point(50, 50, radius * 0.55, angle - step * 0.12);
    const root = point(50, 50, hub, angle - step * 0.25);
    const rootEnd = point(50, 50, hub, angle + step * 0.25);
    return `M${root} Q${back} ${tip} Q${lead} ${rootEnd} Z`;
  }).join(' ');
}

export interface Ring {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
}

export function arcPath(ring: Ring, from: number, to: number): string {
  const { cx, cy, r } = ring;
  const large = to - from > 180 ? 1 : 0;
  return `M${point(cx, cy, r, from)} A${String(r)} ${String(r)} 0 ${String(large)} 1 ${point(cx, cy, r, to)}`;
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

export function circlePath(ring: Ring): string {
  const { cx, cy, r } = ring;
  const top = `${String(cx)} ${String(cy - r)}`;
  const bottom = `${String(cx)} ${String(cy + r)}`;
  return `M${top} A${String(r)} ${String(r)} 0 1 1 ${bottom} A${String(r)} ${String(r)} 0 1 1 ${top} Z`;
}
