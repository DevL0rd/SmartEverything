export interface DrawnShade {
  readonly through: number;
  readonly colour: string;
}

export type DrawnShades = readonly [DrawnShade, ...DrawnShade[]];

export function shadeAt(shades: DrawnShades, share: number): string {
  'worklet';
  let colour = shades[0].colour;
  for (const shade of shades) {
    colour = shade.colour;
    if (share <= shade.through) break;
  }
  return colour;
}
