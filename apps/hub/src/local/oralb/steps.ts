import {
  ORALB_KEY,
  bytesToHex,
  configWrite,
  oralbFullOf,
  oralbServiceOf,
  type OralbConfigKey,
  type OralbPrefixRule,
} from '@smarteverything/ble';
import type { BrushStep } from '@smarteverything/domain';

function writeStep(key: string, payload: Uint8Array): BrushStep {
  return {
    kind: 'write',
    service: oralbServiceOf(key) ?? '',
    characteristic: oralbFullOf(key),
    hex: bytesToHex(payload),
    writeType: 'with_response',
  };
}

export function readStep(key: string): BrushStep {
  return {
    kind: 'read',
    service: oralbServiceOf(key) ?? '',
    characteristic: oralbFullOf(key),
  };
}

export function hasPrefix(key: OralbConfigKey): boolean {
  return configWrite('plain', key, new Uint8Array()).prefix !== null;
}

export function configWriteSteps(
  rule: OralbPrefixRule,
  key: OralbConfigKey,
  payload: Uint8Array,
): BrushStep[] {
  const write = configWrite(rule, key, payload);
  return [
    ...(write.prefix === null ? [] : [writeStep(ORALB_KEY.control, write.prefix)]),
    writeStep(key, payload),
  ];
}

export function configSteps(
  rule: OralbPrefixRule,
  key: OralbConfigKey,
  payload: Uint8Array,
): BrushStep[] {
  return [...configWriteSteps(rule, key, payload), readStep(key)];
}

export function headPayload(state: number, days: number, seconds: number): Uint8Array {
  const payload = new Uint8Array(5);
  const view = new DataView(payload.buffer);
  view.setUint8(0, state);
  view.setUint16(1, days, true);
  view.setUint16(3, seconds, true);
  return payload;
}

export function selectSteps(select: Uint8Array): BrushStep[] {
  return [writeStep(ORALB_KEY.control, select), readStep(ORALB_KEY.session)];
}
