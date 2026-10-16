export const WIZ_SCENES: Readonly<Record<string, number>> = {
  ocean: 1,
  romance: 2,
  sunset: 3,
  party: 4,
  fireplace: 5,
  cozy: 6,
  forest: 7,
  pastel_colors: 8,
  wake_up: 9,
  bedtime: 10,
  warm_white: 11,
  daylight: 12,
  cool_white: 13,
  night_light: 14,
  focus: 15,
  relax: 16,
  true_colors: 17,
  tv_time: 18,
  plantgrowth: 19,
  spring: 20,
  summer: 21,
  fall: 22,
  deep_dive: 23,
  jungle: 24,
  mojito: 25,
  club: 26,
  christmas: 27,
  halloween: 28,
  candlelight: 29,
  golden_white: 30,
  pulse: 31,
  steampunk: 32,
  diwali: 33,
  white: 34,
  alarm: 35,
  snowy_sky: 36,
  dim_to_warm: 40,
};
const TUNABLE = new Set([6, 9, 10, 11, 12, 13, 14, 15, 16, 18, 29, 30, 31, 32, 33, 35, 40]);
const DIMMABLE = new Set([9, 10, 14, 29, 31, 32, 34, 35]);
export type WizBulbClass = 'rgb' | 'tunable' | 'dimmable' | 'unknown';
export function wizBulbClass(module: string | undefined): WizBulbClass {
  const identifier = module?.split('_')[1];
  if (identifier === undefined) return 'unknown';
  if (identifier.includes('RGB')) return 'rgb';
  if (identifier.includes('TW')) return 'tunable';
  return identifier.includes('DW') ? 'dimmable' : 'unknown';
}
export function wizScenes(kind: WizBulbClass, module: string | undefined): readonly string[] {
  if (kind === 'dimmable' && !/_(?:SH|DH)/.test(module ?? '')) return [];
  return Object.entries(WIZ_SCENES).flatMap(([name, id]) => {
    if (kind === 'rgb') return [name];
    if (kind === 'tunable' && TUNABLE.has(id)) return [name];
    return kind === 'dimmable' && DIMMABLE.has(id) ? [name] : [];
  });
}
