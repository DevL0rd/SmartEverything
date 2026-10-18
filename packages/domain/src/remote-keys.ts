export function normalKey(option: string): string {
  return option
    .trim()
    .toLowerCase()
    .replace(/\+$/, '_up')
    .replace(/-$/, '_down')
    .replace(/[\s-]+/g, '_');
}

export const REMOTE_ROLES = [
  'power',
  'temp_up',
  'temp_down',
  'mode',
  'swing',
  'speed_up',
  'speed_down',
  'speed_cycle',
  'oscillate',
  'vol_up',
  'vol_down',
  'mute',
  'input',
  'menu',
  'play_pause',
  'bright_up',
  'bright_down',
] as const;

export type RemoteRole = (typeof REMOTE_ROLES)[number];

const ROLE_WORDS: Readonly<Record<RemoteRole, readonly string[]>> = {
  power: ['power', 'key_power', 'power_toggle', 'on_off', 'power_on_off', 'standby'],
  temp_up: ['temp_up', 'temperature_up', 'temp_plus', 'warmer', 'key_temp_up'],
  temp_down: ['temp_down', 'temperature_down', 'temp_minus', 'cooler', 'key_temp_down'],
  mode: ['mode', 'key_mode'],
  swing: ['swing', 'air_swing', 'key_swing'],
  speed_up: ['speed_up', 'fan_up', 'fan_speed_up', 'wind_up', 'faster'],
  speed_down: ['speed_down', 'fan_down', 'fan_speed_down', 'wind_down', 'slower'],
  speed_cycle: ['speed', 'fan_speed', 'wind_speed'],
  oscillate: ['oscillate', 'oscillation', 'rotate', 'swing_fan'],
  vol_up: ['vol_up', 'volume_up', 'key_volumeup', 'key_volume_up', 'volup', 'volumeup'],
  vol_down: ['vol_down', 'volume_down', 'key_volumedown', 'key_volume_down', 'voldown'],
  mute: ['mute', 'key_mute'],
  input: ['input', 'source', 'key_input', 'key_source', 'tv_av'],
  menu: ['menu', 'key_menu', 'setup'],
  play_pause: ['play_pause', 'play', 'pause', 'key_playpause', 'key_play'],
  bright_up: ['brighter', 'bright_up', 'brightness_up', 'light_up'],
  bright_down: ['dimmer', 'bright_down', 'brightness_down', 'light_down'],
};

const MODE_WORDS: readonly string[] = ['cool', 'heat', 'dry', 'fan_only', 'auto'];

export function keyFor(options: readonly string[], role: RemoteRole): string | undefined {
  const words = ROLE_WORDS[role];
  return options.find((option) => words.includes(normalKey(option)));
}

export function roleOf(option: string): RemoteRole | undefined {
  const word = normalKey(option);
  return REMOTE_ROLES.find((role) => ROLE_WORDS[role].includes(word));
}

export function modeKeysOf(options: readonly string[]): readonly string[] {
  return options.filter((option) => MODE_WORDS.includes(normalKey(option)));
}

export function buttonLabel(option: string): string {
  const spaced = option.replace(/^key_/i, '').replaceAll('_', ' ').trim();
  const shouted = /[A-Z]{2}/.test(spaced) && spaced === spaced.toUpperCase();
  const cased = shouted ? spaced.toLowerCase() : spaced;
  return cased.length === 0 ? option : cased.charAt(0).toUpperCase() + cased.slice(1);
}
