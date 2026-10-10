import type { CapabilityOverride, CapabilityOverrides } from '../types';
import { overrideOf } from './xiaomi-common';

const power = overrideOf('control', 'power');

const CONFIRM: Partial<CapabilityOverride> = { danger: { tier: 'confirm' } };

export const COMPUTER: CapabilityOverrides = {
  shut_down: power('Shut down', CONFIRM),
  restart: power('Restart', CONFIRM),
  sleep: power('Sleep', CONFIRM),
  hibernate: power('Hibernate', CONFIRM),
  sign_out: power('Sign out', CONFIRM),
  lock_screen: power('Lock screen'),
  wake: power('Wake'),
};
