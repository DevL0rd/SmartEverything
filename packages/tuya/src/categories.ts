import type { DeviceKind } from '@smarteverything/domain';

export const IR_REMOTE_CATEGORY_PREFIX = 'infrared_';

export const LIGHT_CATEGORIES: readonly string[] = [
  'dj',
  'dd',
  'xdd',
  'fwd',
  'dc',
  'tgq',
  'tgkg',
  'tyndj',
  'gyd',
  'sxd',
  'dsd',
  'fsd',
];

export const COVER_CATEGORIES: readonly string[] = ['cl', 'clkg', 'ckmkzq', 'mc', 'jdcljqr'];

export const CLIMATE_CATEGORIES = ['kt', 'ktkzq', 'wk', 'wkf', 'qn', 'rs', 'bgl', 'dr'] as const;

export const ILLUMINANCE_CATEGORIES = ['ldcg', 'hps', 'pir', 'gyd'] as const;

const KINDS: Readonly<Record<string, DeviceKind>> = {
  kg: 'switch',
  tdq: 'switch',
  cjkg: 'switch',
  dlq: 'switch',
  ckqdkg: 'switch',
  cz: 'plug',
  pc: 'plug',
  kj: 'air_purifier',
  jsq: 'humidifier',
  xxj: 'humidifier',
  cs: 'dehumidifier',
  kt: 'air_conditioner',
  ktkzq: 'air_conditioner',
  qn: 'heater',
  rs: 'heater',
  bgl: 'heater',
  dr: 'heater',
  fs: 'fan',
  fskg: 'fan',
  wk: 'thermostat',
  wkf: 'thermostat',
  wsdcg: 'sensor',
  mcs: 'sensor',
  pir: 'sensor',
  sj: 'sensor',
  ywbj: 'sensor',
  rqbj: 'sensor',
  jwbj: 'sensor',
  cobj: 'sensor',
  co2bj: 'sensor',
  hjjcy: 'sensor',
  ldcg: 'sensor',
  zd: 'sensor',
  hps: 'sensor',
  ylcg: 'sensor',
  qxj: 'sensor',
  ywcgq: 'sensor',
  'pm2.5': 'sensor',
  voc: 'sensor',
  zndb: 'sensor',
  wxkg: 'sensor',
  sos: 'sensor',
  sp: 'camera',
  ms: 'lock',
  jtmspro: 'lock',
  jtmsbh: 'lock',
  gyms: 'lock',
  videolock: 'lock',
  sd: 'vacuum',
  wnykq: 'ir_blaster',
  wg2: 'gateway',
  wg: 'gateway',
  wfcon: 'gateway',
  bh: 'appliance',
  cwwsq: 'appliance',
  cwysj: 'appliance',
  msp: 'appliance',
  kfj: 'appliance',
  mzj: 'appliance',
  ggq: 'appliance',
  sgbj: 'appliance',
};

const KIND_OF_CATEGORY: ReadonlyMap<string, DeviceKind> = new Map(Object.entries(KINDS));

export function kindOf(category: string): DeviceKind {
  if (category.startsWith(IR_REMOTE_CATEGORY_PREFIX)) {
    return 'ir_remote';
  }
  if (LIGHT_CATEGORIES.includes(category)) {
    return 'light';
  }
  if (COVER_CATEGORIES.includes(category)) {
    return 'cover';
  }
  return KIND_OF_CATEGORY.get(category) ?? 'other';
}
