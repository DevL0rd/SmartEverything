const BASE_HEAD = 'a0f0';

const BASE_TAIL = '-5047-4d53-8208-4f72616c2d42';

const KEY_PATTERN = /^ff[0-9a-f]{2}$/;

export const ORALB_COMPANY_ID = 220;

export function oralbUuid(key: string): string {
  return `${BASE_HEAD}${key.toLowerCase()}${BASE_TAIL}`;
}

export function oralbShortOf(uuid: string): string {
  const lower = uuid.toLowerCase();
  if (lower.length === 36 && lower.startsWith(BASE_HEAD) && lower.endsWith(BASE_TAIL)) {
    return lower.slice(4, 8);
  }
  return lower;
}

export function oralbFullOf(key: string): string {
  return KEY_PATTERN.test(key.toLowerCase()) ? oralbUuid(key) : key;
}

export const ORALB_SERVICE = {
  brush: oralbUuid('ff00'),
  config: oralbUuid('ff20'),
  firmware: oralbUuid('ff80'),
} as const;

export const ORALB_KEY = {
  mac: 'ff01',
  deviceInfo: 'ff02',
  user: 'ff03',
  state: 'ff04',
  battery: 'ff05',
  button: 'ff06',
  mode: 'ff07',
  timer: 'ff08',
  sector: 'ff09',
  face: 'ff0a',
  pressure: 'ff0b',
  control: 'ff21',
  clock: 'ff22',
  modeSlots: 'ff25',
  pacer: 'ff26',
  session: 'ff29',
  ringColour: 'ff2b',
  head: 'ff2d',
} as const;

const SERVICE_BY_DIGIT: ReadonlyMap<string, string> = new Map([
  ['0', ORALB_SERVICE.brush],
  ['2', ORALB_SERVICE.config],
  ['8', ORALB_SERVICE.firmware],
]);

export function oralbServiceOf(key: string): string | null {
  const lower = key.toLowerCase();
  return KEY_PATTERN.test(lower) ? (SERVICE_BY_DIGIT.get(lower.charAt(2)) ?? null) : null;
}

export const ORALB_SCAN_MANUFACTURER = { companyId: ORALB_COMPANY_ID } as const;
