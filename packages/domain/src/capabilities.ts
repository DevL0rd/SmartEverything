import { z } from 'zod';
import type { ValueDescriptor } from './values';
export const CAPABILITY_GROUPS = [
  'power',
  'lighting',
  'climate',
  'air',
  'water',
  'fragrance',
  'sensor',
  'security',
  'camera',
  'media',
  'cleaning',
  'cover',
  'energy',
  'infrared',
  'system',
] as const;

export type CapabilityGroup = (typeof CAPABILITY_GROUPS)[number];

export const ACCESS_MODES = ['read', 'write', 'read_write'] as const;

export type AccessMode = (typeof ACCESS_MODES)[number];

interface CatalogueEntry {
  readonly label: string;
  readonly group: CapabilityGroup;
  readonly kind: ValueDescriptor['kind'];
  readonly keywords: readonly string[];
  readonly sampled?: boolean;
}

export const CAPABILITY_CATALOGUE = {
  power: { label: 'Power', group: 'power', kind: 'boolean', keywords: ['on', 'off', 'switch'] },
  brightness: {
    label: 'Brightness',
    group: 'lighting',
    kind: 'number',
    keywords: ['dim', 'level'],
  },
  color: { label: 'Colour', group: 'lighting', kind: 'color', keywords: ['hue', 'rgb'] },
  color_temperature: {
    label: 'Colour temperature',
    group: 'lighting',
    kind: 'number',
    keywords: ['warm', 'cool', 'kelvin', 'white'],
  },
  light_effect: { label: 'Light effect', group: 'lighting', kind: 'enum', keywords: ['scene'] },
  night_light: { label: 'Night light', group: 'lighting', kind: 'boolean', keywords: ['glow'] },
  target_temperature: {
    label: 'Target temperature',
    group: 'climate',
    kind: 'number',
    keywords: ['thermostat', 'setpoint', 'heat', 'cool'],
  },
  temperature: { label: 'Temperature', group: 'climate', kind: 'number', keywords: ['°', 'heat'] },
  hvac_mode: {
    label: 'Mode',
    group: 'climate',
    kind: 'enum',
    keywords: ['cool', 'heat', 'dry', 'auto', 'air conditioner'],
  },
  fan_mode: { label: 'Fan mode', group: 'climate', kind: 'enum', keywords: ['fan', 'airflow'] },
  fan_speed: { label: 'Fan speed', group: 'climate', kind: 'number', keywords: ['fan', 'level'] },
  oscillation: { label: 'Oscillation', group: 'climate', kind: 'boolean', keywords: ['swing'] },
  swing: { label: 'Swing', group: 'climate', kind: 'enum', keywords: ['louver', 'vane'] },
  target_humidity: {
    label: 'Target humidity',
    group: 'water',
    kind: 'number',
    keywords: ['humidifier', 'dehumidifier', 'moisture'],
  },
  humidity: { label: 'Humidity', group: 'water', kind: 'number', keywords: ['moisture', 'rh'] },
  mist_level: { label: 'Mist level', group: 'water', kind: 'enum', keywords: ['humidifier'] },
  water_level: { label: 'Water level', group: 'water', kind: 'number', keywords: ['tank'] },
  tank_full: { label: 'Tank full', group: 'water', kind: 'boolean', keywords: ['bucket'] },
  tank_empty: { label: 'Tank empty', group: 'water', kind: 'boolean', keywords: ['refill'] },
  pm25: { label: 'PM2.5', group: 'air', kind: 'number', keywords: ['air quality', 'dust'] },
  pm10: { label: 'PM10', group: 'air', kind: 'number', keywords: ['air quality', 'dust'] },
  co2: { label: 'CO₂', group: 'air', kind: 'number', keywords: ['carbon dioxide', 'ppm'] },
  tvoc: { label: 'TVOC', group: 'air', kind: 'number', keywords: ['voc', 'chemicals'] },
  hcho: { label: 'Formaldehyde', group: 'air', kind: 'number', keywords: ['hcho'] },
  air_quality_index: { label: 'Air quality', group: 'air', kind: 'number', keywords: ['aqi'] },
  purifier_mode: { label: 'Purifier mode', group: 'air', kind: 'enum', keywords: ['purifier'] },
  filter_life: { label: 'Filter life', group: 'air', kind: 'number', keywords: ['filter'] },
  filter_reset: { label: 'Reset filter', group: 'air', kind: 'action', keywords: ['filter'] },
  child_lock: { label: 'Child lock', group: 'system', kind: 'boolean', keywords: ['buttons'] },
  display_brightness: { label: 'Display', group: 'system', kind: 'enum', keywords: ['screen'] },
  buzzer: { label: 'Button sounds', group: 'system', kind: 'boolean', keywords: ['beep'] },
  off_timer: { label: 'Turn off in', group: 'system', kind: 'number', keywords: ['timer'] },
  battery: { label: 'Battery', group: 'sensor', kind: 'number', keywords: ['charge'] },
  motion: { label: 'Motion', group: 'sensor', kind: 'boolean', keywords: ['movement', 'pir'] },
  contact: { label: 'Contact', group: 'sensor', kind: 'boolean', keywords: ['door', 'window'] },
  occupancy: { label: 'Occupancy', group: 'sensor', kind: 'boolean', keywords: ['presence'] },
  object_count: {
    label: 'Detected objects',
    group: 'sensor',
    kind: 'number',
    keywords: ['count', 'presence', 'objects'],
  },
  illumination: {
    label: 'Light category',
    group: 'sensor',
    kind: 'enum',
    keywords: ['dark', 'twilight', 'bright'],
  },
  illuminance: { label: 'Light level', group: 'sensor', kind: 'number', keywords: ['lux'] },
  leak: { label: 'Water leak', group: 'sensor', kind: 'boolean', keywords: ['flood'] },
  smoke: { label: 'Smoke', group: 'sensor', kind: 'boolean', keywords: ['fire'] },
  gas: { label: 'Gas', group: 'sensor', kind: 'boolean', keywords: ['leak'] },
  vibration: { label: 'Vibration', group: 'sensor', kind: 'boolean', keywords: ['shake'] },
  pressure: { label: 'Pressure', group: 'sensor', kind: 'number', keywords: ['hpa'] },
  button: { label: 'Button', group: 'sensor', kind: 'enum', keywords: ['press', 'click'] },
  lock: { label: 'Lock', group: 'security', kind: 'boolean', keywords: ['door', 'unlock'] },
  alarm: { label: 'Alarm', group: 'security', kind: 'enum', keywords: ['arm', 'disarm'] },
  siren: { label: 'Siren', group: 'security', kind: 'boolean', keywords: ['sound'] },
  doorbell: { label: 'Doorbell', group: 'security', kind: 'action', keywords: ['ring'] },
  camera_stream: { label: 'Live view', group: 'camera', kind: 'text', keywords: ['video'] },
  ptz: { label: 'Pan and tilt', group: 'camera', kind: 'action', keywords: ['pan', 'tilt'] },
  ptz_preset: { label: 'Camera position', group: 'camera', kind: 'enum', keywords: ['preset'] },
  zoom: { label: 'Zoom', group: 'camera', kind: 'number', keywords: ['magnify'] },
  night_vision: { label: 'Night vision', group: 'camera', kind: 'enum', keywords: ['infrared'] },
  motion_detection: {
    label: 'Motion detection',
    group: 'camera',
    kind: 'boolean',
    keywords: ['alerts'],
  },
  motion_sensitivity: { label: 'Sensitivity', group: 'camera', kind: 'enum', keywords: [] },
  recording: { label: 'Recording', group: 'camera', kind: 'enum', keywords: ['record', 'sd'] },
  privacy_mode: { label: 'Privacy', group: 'camera', kind: 'boolean', keywords: ['sleep', 'off'] },
  image_flip: { label: 'Flip image', group: 'camera', kind: 'boolean', keywords: ['rotate'] },
  watermark: { label: 'Time watermark', group: 'camera', kind: 'boolean', keywords: [] },
  status_light: { label: 'Status light', group: 'camera', kind: 'boolean', keywords: ['led'] },
  two_way_audio: { label: 'Talk', group: 'camera', kind: 'boolean', keywords: ['intercom'] },
  call_status: { label: 'Call', group: 'camera', kind: 'enum', keywords: ['call', 'ring'] },
  call_hang_up: { label: 'Hang up', group: 'camera', kind: 'action', keywords: ['call'] },
  storage_free: { label: 'Storage free', group: 'camera', kind: 'number', keywords: ['sd'] },
  playback: { label: 'Playback', group: 'media', kind: 'enum', keywords: ['play', 'pause'] },
  volume: { label: 'Volume', group: 'media', kind: 'number', keywords: ['sound', 'loud'] },
  mute: { label: 'Mute', group: 'media', kind: 'boolean', keywords: ['silent'] },
  input_source: { label: 'Input', group: 'media', kind: 'enum', keywords: ['hdmi', 'source'] },
  channel: { label: 'Channel', group: 'media', kind: 'number', keywords: ['tv'] },
  app_launch: { label: 'Open app', group: 'media', kind: 'enum', keywords: ['netflix', 'tv'] },
  remote_key: { label: 'Remote button', group: 'media', kind: 'enum', keywords: ['remote'] },
  art_mode: { label: 'Art mode', group: 'media', kind: 'boolean', keywords: ['frame', 'gallery'] },
  cleaning: { label: 'Cleaning', group: 'cleaning', kind: 'enum', keywords: ['vacuum', 'dock'] },
  suction: { label: 'Suction', group: 'cleaning', kind: 'enum', keywords: ['vacuum', 'power'] },
  mop_level: { label: 'Mop water', group: 'cleaning', kind: 'enum', keywords: ['mop'] },
  cover_position: { label: 'Position', group: 'cover', kind: 'number', keywords: ['blind'] },
  cover_action: { label: 'Open or close', group: 'cover', kind: 'enum', keywords: ['curtain'] },
  power_draw: { label: 'Power draw', group: 'energy', kind: 'number', keywords: ['watts'] },
  energy: { label: 'Energy used', group: 'energy', kind: 'number', keywords: ['kwh'] },
  voltage: { label: 'Voltage', group: 'energy', kind: 'number', keywords: ['volts'] },
  ir_send: { label: 'Send IR code', group: 'infrared', kind: 'action', keywords: ['remote'] },
  ir_learn: { label: 'Learn IR code', group: 'infrared', kind: 'action', keywords: ['remote'] },
  signal_strength: { label: 'Signal', group: 'system', kind: 'number', keywords: ['rssi'] },
  wan_connected: {
    label: 'Internet',
    group: 'system',
    kind: 'boolean',
    keywords: ['online', 'wan'],
  },
  latency: {
    label: 'Latency',
    group: 'system',
    kind: 'number',
    keywords: ['ping', 'lag'],
    sampled: true,
  },
  packet_loss: {
    label: 'Packet loss',
    group: 'system',
    kind: 'number',
    keywords: ['ping', 'drops'],
  },
  network_clients: {
    label: 'Devices online',
    group: 'system',
    kind: 'number',
    keywords: ['wifi', 'clients'],
  },
  dns_protection: {
    label: 'Ad blocking',
    group: 'system',
    kind: 'boolean',
    keywords: ['adguard', 'dns'],
  },
  dns_blocked_percent: {
    label: 'Blocked lookups',
    group: 'system',
    kind: 'number',
    keywords: ['adguard', 'dns'],
  },
  dns_queries: { label: 'Lookups', group: 'system', kind: 'number', keywords: ['adguard', 'dns'] },
  sync_state: { label: 'Sync', group: 'system', kind: 'enum', keywords: ['syncthing', 'files'] },
  sync_remaining: {
    label: 'Left to sync',
    group: 'system',
    kind: 'number',
    keywords: ['syncthing'],
  },
  sync_folders_behind: {
    label: 'Folders behind',
    group: 'system',
    kind: 'number',
    keywords: ['syncthing'],
  },
  sync_peers_online: {
    label: 'Devices connected',
    group: 'system',
    kind: 'number',
    keywords: ['syncthing'],
  },
  sync_paused: {
    label: 'Paused',
    group: 'system',
    kind: 'boolean',
    keywords: ['syncthing', 'pause'],
  },
  firmware: { label: 'Firmware', group: 'system', kind: 'text', keywords: ['version'] },
  cpu_load: {
    label: 'Processor',
    group: 'system',
    kind: 'number',
    keywords: ['cpu', 'load', 'usage'],
    sampled: true,
  },
  memory_used: {
    label: 'Memory',
    group: 'system',
    kind: 'number',
    keywords: ['ram', 'memory'],
    sampled: true,
  },
  gpu_load: {
    label: 'Graphics',
    group: 'system',
    kind: 'number',
    keywords: ['gpu', 'graphics card'],
    sampled: true,
  },
  disk_used: {
    label: 'Disk',
    group: 'system',
    kind: 'number',
    keywords: ['storage', 'drive', 'space'],
    sampled: true,
  },
  cpu_temperature: {
    label: 'Processor temperature',
    group: 'system',
    kind: 'number',
    keywords: ['cpu', 'heat'],
    sampled: true,
  },
  gpu_temperature: {
    label: 'Graphics temperature',
    group: 'system',
    kind: 'number',
    keywords: ['gpu', 'heat'],
    sampled: true,
  },
  download_rate: {
    label: 'Download',
    group: 'system',
    kind: 'number',
    keywords: ['network', 'internet', 'speed'],
    sampled: true,
  },
  upload_rate: {
    label: 'Upload',
    group: 'system',
    kind: 'number',
    keywords: ['network', 'internet', 'speed'],
    sampled: true,
  },
  shut_down: {
    label: 'Shut down',
    group: 'power',
    kind: 'action',
    keywords: ['power off', 'turn off', 'computer'],
  },
  restart: { label: 'Restart', group: 'power', kind: 'action', keywords: ['reboot', 'computer'] },
  sleep: { label: 'Sleep', group: 'power', kind: 'action', keywords: ['suspend', 'computer'] },
  hibernate: { label: 'Hibernate', group: 'power', kind: 'action', keywords: ['computer'] },
  lock_screen: {
    label: 'Lock screen',
    group: 'power',
    kind: 'action',
    keywords: ['lock', 'computer'],
  },
  sign_out: {
    label: 'Sign out',
    group: 'power',
    kind: 'action',
    keywords: ['log out', 'logout', 'computer'],
  },
  wake: {
    label: 'Wake',
    group: 'power',
    kind: 'action',
    keywords: ['wake on lan', 'turn on', 'computer'],
  },
  charging: {
    label: 'Charging',
    group: 'power',
    kind: 'boolean',
    keywords: ['battery', 'plugged'],
  },
  locked: { label: 'Locked', group: 'system', kind: 'boolean', keywords: ['screen', 'lock'] },
  focused_app: {
    label: 'Active app',
    group: 'system',
    kind: 'text',
    keywords: ['window', 'program'],
  },
  signed_in_user: {
    label: 'Signed in',
    group: 'system',
    kind: 'text',
    keywords: ['user', 'login'],
  },
  phone_context: {
    label: 'Doing',
    group: 'sensor',
    kind: 'enum',
    keywords: ['driving', 'walking', 'activity', 'context'],
  },
  ringer_mode: { label: 'Ringer', group: 'media', kind: 'enum', keywords: ['silent', 'vibrate'] },
  dnd: { label: 'Do Not Disturb', group: 'system', kind: 'boolean', keywords: ['quiet', 'focus'] },
  network: {
    label: 'Network',
    group: 'system',
    kind: 'enum',
    keywords: ['wifi', 'mobile', 'data'],
  },
  screen_on: {
    label: 'Screen on',
    group: 'system',
    kind: 'boolean',
    keywords: ['display', 'using'],
  },
  screen_time_today: {
    label: 'Screen time today',
    group: 'system',
    kind: 'number',
    keywords: ['usage', 'phone time'],
  },
  now_playing: { label: 'Now playing', group: 'media', kind: 'text', keywords: ['song', 'track'] },
  ring: {
    label: 'Ring',
    group: 'system',
    kind: 'action',
    keywords: ['find', 'lost', 'phone', 'find my phone', 'locate'],
  },
  flashlight: {
    label: 'Flashlight',
    group: 'lighting',
    kind: 'enum',
    keywords: ['torch', 'light', 'lamp', 'phone'],
  },
} as const satisfies Record<string, CatalogueEntry>;

export type StandardCapability = keyof typeof CAPABILITY_CATALOGUE;

export type RawCapability = `raw:${string}`;

export type CapabilityKey = StandardCapability | RawCapability;

const STANDARD_KEYS: ReadonlySet<string> = new Set(Object.keys(CAPABILITY_CATALOGUE));

export function isStandardCapability(key: string): key is StandardCapability {
  return STANDARD_KEYS.has(key);
}

export function isRawCapability(key: string): key is RawCapability {
  return /^raw:[a-z0-9][a-z0-9_.:-]*$/.test(key);
}

export const CAPABILITY_KEY = z
  .string()
  .refine((key) => isStandardCapability(key) || isRawCapability(key), {
    message: 'not a catalogued capability or a raw:<name> capability',
  })
  .transform((key): CapabilityKey => (isStandardCapability(key) ? key : `raw:${key.slice(4)}`));

export function catalogueEntryOf(key: StandardCapability): CatalogueEntry {
  return CAPABILITY_CATALOGUE[key];
}

export function isSampledCapability(key: string): boolean {
  if (!isStandardCapability(key)) {
    return false;
  }
  const entry: CatalogueEntry = CAPABILITY_CATALOGUE[key];
  return entry.sampled === true;
}
