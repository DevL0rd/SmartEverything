import {
  type OralbPrefixRuleName,
  type OralbProbe,
  type OralbSettings,
} from '@smarteverything/domain';

export type ProbeResult = NonNullable<OralbSettings['probes'][OralbProbe]>;

type PassedProbe = Extract<ProbeResult, { readonly passedAt: string }>;

export const WRITE_PROBES: readonly OralbProbe[] = [
  'pacer_write',
  'mode_order_write',
  'ring_write',
  'head_reset_write',
  'clock_write',
];

function passedProbe(
  settings: OralbSettings,
  probe: OralbProbe,
  firmware: number,
): PassedProbe | null {
  const result = settings.probes[probe];
  return result !== undefined && 'passedAt' in result && result.firmware === firmware
    ? result
    : null;
}

export function ruleOf(
  settings: OralbSettings,
  probe: OralbProbe,
  firmware: number,
): OralbPrefixRuleName | null {
  return passedProbe(settings, probe, firmware)?.rule ?? null;
}

export function writeOpen(settings: OralbSettings, probe: OralbProbe, firmware: number): boolean {
  return ruleOf(settings, probe, firmware) !== null;
}
