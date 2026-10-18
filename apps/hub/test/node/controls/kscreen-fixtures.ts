export interface FixtureOutput {
  readonly name: string;
  readonly enabled: boolean;
  readonly type?: number;
  readonly mode?: string;
  readonly x?: number;
  readonly y?: number;
  readonly scale?: number;
  readonly rotation?: number;
  readonly priority?: number;
  readonly hdr?: boolean;
  readonly vrrPolicy?: number;
  readonly brightness?: number;
  readonly replicationSource?: number;
}

const MODES = [
  { id: '1', refreshRate: 164.9989929199219, size: { width: 2560, height: 1440 } },
  { id: '2', refreshRate: 59.95100021362305, size: { width: 2560, height: 1440 } },
  { id: '3', refreshRate: 60, size: { width: 1920, height: 1080 } },
];

function optionalFields(output: FixtureOutput): Record<string, number | boolean> {
  const fields: Record<string, number | boolean | undefined> = {
    hdr: output.hdr,
    vrrPolicy: output.vrrPolicy,
    brightness: output.brightness,
  };
  return Object.fromEntries(
    Object.entries(fields).filter(
      (entry): entry is [string, number | boolean] => entry[1] !== undefined,
    ),
  );
}

export function kscreen(outputs: readonly FixtureOutput[]): string {
  return JSON.stringify({
    features: 255,
    outputs: outputs.map((output, index) => ({
      id: index + 1,
      name: output.name,
      connected: true,
      enabled: output.enabled,
      type: output.type ?? 14,
      currentModeId: output.mode ?? '1',
      preferredModes: ['1'],
      modes: MODES,
      pos: { x: output.x ?? 0, y: output.y ?? 0 },
      scale: output.scale ?? 1,
      rotation: output.rotation ?? 1,
      priority: output.priority ?? index + 1,
      replicationSource: output.replicationSource ?? 0,
      ...optionalFields(output),
    })),
  });
}

export const TWO_SCREENS = kscreen([
  { name: 'DP-3', enabled: true, x: 0, scale: 1.25, hdr: false, vrrPolicy: 2, brightness: 0.8 },
  { name: 'eDP-2', enabled: true, type: 7, x: 2048, y: 0, scale: 1, priority: 2, brightness: 0.5 },
]);

export const ONE_SCREEN_ON = kscreen([
  { name: 'DP-3', enabled: true, x: 0, scale: 1.25 },
  { name: 'eDP-2', enabled: false, type: 7, x: 2048, priority: 2 },
]);
