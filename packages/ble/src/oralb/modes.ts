import { UnsupportedOralbProtocol } from './errors';

export const ORALB_MODES: Readonly<Record<number, string>> = {
  0: 'daily_clean',
  1: 'sensitive',
  2: 'gum_care',
  3: 'whiten',
  4: 'intense',
  5: 'super_sensitive',
  6: 'tongue_clean',
  7: 'off',
  8: 'settings',
  9: 'off',
  11: 'smart_adapt',
  12: 'gentle_white',
};

export const ORALB_FIRST_IO_PROTOCOL = 6;

export function oralbModeName(id: number): string | null {
  return ORALB_MODES[id] ?? null;
}

export function requireIoProtocol(protocol: number): number {
  if (protocol < ORALB_FIRST_IO_PROTOCOL) {
    throw new UnsupportedOralbProtocol(protocol);
  }
  return protocol;
}
