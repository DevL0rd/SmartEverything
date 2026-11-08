import { IrCodeError, MAX_PULSE_MICROSECONDS, pulsesToBase64 } from '../ir-codes';

export function longGapsLimited(pulses: readonly number[]): readonly number[] {
  return pulses.map((pulse, index) =>
    index % 2 === 1 ? Math.min(pulse, MAX_PULSE_MICROSECONDS) : pulse,
  );
}

export function pulsesToCode(pulses: readonly number[]): string {
  return pulsesToBase64(longGapsLimited(pulses));
}

const BROADLINK_IR = 0x26;
const BROADLINK_HEADER_BYTES = 4;
const BROADLINK_LONG_PULSE = 0x00;
const TICK_MICROSECONDS = 8192 / 269;

function broadlinkFail(reason: string): IrCodeError {
  return new IrCodeError('pulses', `the Broadlink code ${reason}`);
}

function broadlinkPayload(bytes: Uint8Array): Uint8Array {
  if (bytes.length < BROADLINK_HEADER_BYTES || bytes[0] !== BROADLINK_IR) {
    throw broadlinkFail('does not start with the infrared packet type 0x26');
  }
  const length = (bytes[2] ?? 0) | ((bytes[3] ?? 0) << 8);
  const payload = bytes.subarray(BROADLINK_HEADER_BYTES, BROADLINK_HEADER_BYTES + length);
  if (payload.length !== length) {
    throw broadlinkFail(`announces ${String(length)} bytes but holds ${String(payload.length)}`);
  }
  return payload;
}

export function pulsesFromBroadlink(text: string): readonly number[] {
  let payload: Uint8Array;
  try {
    payload = broadlinkPayload(Uint8Array.fromBase64(text, { lastChunkHandling: 'loose' }));
  } catch (error) {
    if (error instanceof IrCodeError) {
      throw error;
    }
    throw broadlinkFail(`is not base64 (${String(error)})`);
  }
  const pulses: number[] = [];
  let at = 0;
  while (at < payload.length) {
    const first = payload[at] ?? 0;
    const ticks =
      first === BROADLINK_LONG_PULSE
        ? ((payload[at + 1] ?? 0) << 8) | (payload[at + 2] ?? 0)
        : first;
    at += first === BROADLINK_LONG_PULSE ? 3 : 1;
    pulses.push(Math.round(ticks * TICK_MICROSECONDS));
  }
  return pulses;
}

export function pulsesFromSigned(values: readonly number[]): readonly number[] {
  const alternates = values.every((value, index) => value !== 0 && value > 0 === (index % 2 === 0));
  if (!alternates) {
    throw new IrCodeError(
      'pulses',
      'a signed pulse train alternates positive marks and negative gaps',
    );
  }
  return values.map((value) => Math.abs(value));
}

export function pulsesFromSignedText(text: string): readonly number[] {
  return pulsesFromSigned(
    text
      .trim()
      .split(/[\s,]+/)
      .map(Number),
  );
}
