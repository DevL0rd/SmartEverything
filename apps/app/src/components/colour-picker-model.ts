import type { HsvColor } from '@smarteverything/domain';

export const COLOUR_SIZE = 256;
export const COLOUR_PADDING = 12;
const FULL_TURN = 360;
const RADIANS = Math.PI / 180;

export interface ColourViewport {
  readonly width: number;
  readonly height: number;
}

export function colourAt(x: number, y: number, size: ColourViewport, value: number): HsvColor {
  const diameter = Math.min(size.width, size.height);
  const radius = (diameter * COLOUR_SIZE) / (2 * (COLOUR_SIZE + COLOUR_PADDING * 2));
  const dx = x - size.width / 2;
  const dy = y - size.height / 2;
  return {
    hue: Math.round((Math.atan2(dy, dx) / RADIANS + FULL_TURN) % FULL_TURN),
    saturation: Math.round(Math.min(100, (Math.hypot(dx, dy) / radius) * 100)),
    value,
  };
}

export function colourPoint(colour: HsvColor): { readonly x: number; readonly y: number } {
  const radius = COLOUR_SIZE / 2;
  const distance = (radius * colour.saturation) / 100;
  return {
    x: radius + Math.cos(colour.hue * RADIANS) * distance,
    y: radius + Math.sin(colour.hue * RADIANS) * distance,
  };
}

export function colourCss(colour: HsvColor): string {
  const lightness = (colour.value / 100) * (1 - colour.saturation / 200);
  const denominator = Math.min(lightness, 1 - lightness);
  const saturation = denominator === 0 ? 0 : (colour.value / 100 - lightness) / denominator;
  return `hsl(${String(colour.hue)}, ${String(Math.round(saturation * 100))}%, ${String(Math.round(lightness * 100))}%)`;
}

export function hueSector(hue: number, step: number): string {
  const radius = COLOUR_SIZE / 2;
  const point = (angle: number): string =>
    `${String(radius + radius * Math.cos(angle * RADIANS))} ${String(radius + radius * Math.sin(angle * RADIANS))}`;
  return `M ${String(radius)} ${String(radius)} L ${point(hue)} A ${String(radius)} ${String(radius)} 0 0 1 ${point(hue + step)} Z`;
}

export function nudgeColour(colour: HsvColor, key: string): HsvColor | null {
  switch (key) {
    case 'ArrowRight':
      return { ...colour, hue: (colour.hue + 3) % FULL_TURN };
    case 'ArrowLeft':
      return { ...colour, hue: (colour.hue + FULL_TURN - 3) % FULL_TURN };
    case 'ArrowUp':
      return { ...colour, saturation: Math.min(100, colour.saturation + 3) };
    case 'ArrowDown':
      return { ...colour, saturation: Math.max(0, colour.saturation - 3) };
    default:
      return null;
  }
}
