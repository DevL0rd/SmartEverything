import type { OralbPrefixRuleName, OralbProbe } from '@smarteverything/domain';
import type { Writes } from '../toothbrush/brand';
import type { DeviceState } from '../toothbrush/fleet';
import { entrySettingsOf, identityOf, oralbBlockOf } from './config';
import { WRITE_PROBES, ruleOf, writeOpen } from './probes-state';
import { isRunning } from './state';

const REASON_PROBE =
  'Changing the brush is off until the handle test for this passes (Settings > Diagnostics > Handle tests).';

export const REASON_CONSENT =
  'The owner has not allowed SmartEverything to change brush settings. Turn it on in the toothbrush settings.';

const REASON_BUSY = 'the brush is in use; change it after brushing';

const REASON_ASLEEP = 'the brush is asleep: lift it and try again';

export class GateError extends Error {
  override readonly name = 'GateError';
}

export function oralbWrites(state: DeviceState): Writes {
  const settings = entrySettingsOf(state.entry);
  const { firmware } = identityOf(state.entry);
  const block = oralbBlockOf(settings);
  if (!WRITE_PROBES.some((probe) => writeOpen(block, probe, firmware))) {
    return { allowed: false, reason: REASON_PROBE };
  }
  return settings.consent
    ? { allowed: true, reason: null }
    : { allowed: false, reason: REASON_CONSENT };
}

function openRule(state: DeviceState, probe: OralbProbe): OralbPrefixRuleName {
  const block = oralbBlockOf(entrySettingsOf(state.entry));
  const rule = ruleOf(block, probe, identityOf(state.entry).firmware);
  if (rule === null) {
    throw new GateError(REASON_PROBE);
  }
  return rule;
}

export function assertIdleAndLinked(state: DeviceState): void {
  if (isRunning(state.runtime.state.activity)) {
    throw new GateError(REASON_BUSY);
  }
  if (state.link.phase !== 'linked') {
    throw new GateError(REASON_ASLEEP);
  }
}

export function assertConsent(state: DeviceState): void {
  if (!entrySettingsOf(state.entry).consent) {
    throw new GateError(REASON_CONSENT);
  }
}

export function assertWritable(state: DeviceState, probe: OralbProbe): OralbPrefixRuleName {
  const rule = openRule(state, probe);
  assertConsent(state);
  assertIdleAndLinked(state);
  return rule;
}
