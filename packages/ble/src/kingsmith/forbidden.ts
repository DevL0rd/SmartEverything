import { ForbiddenFrameError } from './errors';

const FIRMWARE_LEAD = 0xe8;

const CALIBRATION_PREFERENCE_KEY = 2;

const RECORD_POP = [0xf7, 0xa7, 0xaa, 0x00];

const INCLINE_OR_BEEP = [0xf7, 0xa2, 0x03];

const ASK_PROFILE = [0xf7, 0xa5];

const HEART_SYNC = [0xf7, 0xa2, 0x06];

const BUTTON_LOCK = [0xf7, 0xa2, 0x07];

const PREFIXES: readonly (readonly number[])[] = [
  RECORD_POP,
  INCLINE_OR_BEEP,
  ASK_PROFILE,
  HEART_SYNC,
  BUTTON_LOCK,
];

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((byte, index) => bytes[index] === byte);
}

export function assertSendable(bytes: Uint8Array): void {
  const refused =
    bytes[0] === FIRMWARE_LEAD ||
    PREFIXES.some((prefix) => startsWith(bytes, prefix)) ||
    (startsWith(bytes, [0xf7, 0xa6]) && bytes[2] === CALIBRATION_PREFERENCE_KEY);
  if (refused) {
    throw new ForbiddenFrameError(
      `Refusing to send ${bytes.toHex()}: firmware, calibration, record-pop, heart-rate sync, button-lock and unknown frames are never sent to a treadmill.`,
    );
  }
}
