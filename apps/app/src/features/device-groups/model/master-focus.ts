export type MasterControl = 'level' | 'white' | 'colour';

const CONTROL_OF: ReadonlyMap<string, MasterControl> = new Map([
  ['brightness', 'level'],
  ['color_temperature', 'white'],
  ['color', 'colour'],
]);

export function masterControlOf(focus: string | null): MasterControl | null {
  return focus === null ? null : (CONTROL_OF.get(focus) ?? null);
}
