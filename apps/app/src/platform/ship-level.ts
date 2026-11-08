export type ShipLevel = 'trace' | 'debug' | 'info' | 'warn';

export const SHIP_LEVEL_CHOICES: readonly ShipLevel[] = ['warn', 'info', 'debug', 'trace'];

export const SHIP_LEVEL_TEXT: Readonly<Record<ShipLevel, string>> = {
  warn: 'Sends warnings, errors and exceptions to the hub.',
  info: 'Also sends the normal level: connections, saves and failures.',
  debug: 'Also sends the detail behind each step.',
  trace: 'Sends every internal step. The noisiest choice and only for a short look.',
};

const ORDER: readonly ShipLevel[] = ['trace', 'debug', 'info', 'warn'];

export const SHIP_LEVEL_FLAGS = {
  trace: 'log.ship.trace',
  debug: 'log.ship.debug',
  info: 'log.ship.info',
  warn: 'log.ship.warn',
} as const satisfies Readonly<Record<ShipLevel, string>>;

export type ShipLevelFlagId = (typeof SHIP_LEVEL_FLAGS)[ShipLevel];

export function shipLevelOf(flags: Readonly<Record<string, boolean>>): ShipLevel {
  return SHIP_LEVEL_CHOICES.find((level) => flags[SHIP_LEVEL_FLAGS[level]] === true) ?? 'warn';
}

const SEVERITY: Readonly<Record<string, ShipLevel>> = {
  exception: 'warn',
  error: 'warn',
  warn: 'warn',
  info: 'info',
  debug: 'debug',
  trace: 'trace',
};

export function wantsShipped(level: string, ship: ShipLevel): boolean {
  const severity = ORDER.find((known) => known === level);
  if (severity === undefined) {
    return (SEVERITY[level] ?? null) !== null && wantsShipped(SEVERITY[level] ?? 'trace', ship);
  }
  return ORDER.indexOf(ship) <= ORDER.indexOf(severity);
}

export function withShipLevel(
  stored: Readonly<Record<string, boolean>>,
  level: ShipLevel,
): Readonly<Record<string, boolean>> {
  const rest = Object.entries(stored).filter(([id]) => !id.startsWith('log.ship.'));
  return { ...Object.fromEntries(rest), [SHIP_LEVEL_FLAGS[level]]: true };
}
