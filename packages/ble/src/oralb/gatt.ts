import { macOf, uint16, uint32, uint8 } from '../bytes';
import type { OralbDelta, OralbSector } from './delta';
import { requireAtLeast, requireLength } from './errors';
import { ORALB_KEY, oralbShortOf } from './uuids';
import { decodeOralbRecord } from './record';

const UNKNOWN_RUNTIME = 0xffff;

const SECTOR_NONE = 0xf0;

const SECTOR_LAST = 0xff;

const EMPTY_SLOT = 0xff;

const PROTOCOL_WITHOUT_RUNTIME = 6;

const MAC_LENGTH = 6;

const SLOT_COUNT = 8;

function signed(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export function decodeOralbMac(bytes: Uint8Array): OralbDelta {
  requireLength('FF01', bytes, [MAC_LENGTH]);
  return { mac: macOf(Uint8Array.from(bytes).reverse()) };
}

export function decodeOralbDeviceInfo(bytes: Uint8Array): OralbDelta {
  requireLength('FF02', bytes, [3]);
  return { modelId: uint8(bytes, 0), protocol: uint8(bytes, 1), firmware: uint8(bytes, 2) };
}

export function decodeOralbUser(bytes: Uint8Array): OralbDelta {
  requireLength('FF03', bytes, [1]);
  return { userId: uint8(bytes, 0) };
}

export function decodeOralbState(bytes: Uint8Array): OralbDelta {
  requireLength('FF04', bytes, [2]);
  return { state: uint8(bytes, 0), substate: uint8(bytes, 1) };
}

export function decodeOralbBattery(bytes: Uint8Array, protocol: number | null): OralbDelta {
  requireAtLeast('FF05', bytes, 1);
  let delta: OralbDelta = { battery: uint8(bytes, 0) };
  if (bytes.length >= 3) {
    const raw = uint16(bytes, 1);
    const unavailable =
      raw === UNKNOWN_RUNTIME || (raw === 0 && protocol === PROTOCOL_WITHOUT_RUNTIME);
    delta = { ...delta, runtimeLeftS: unavailable ? null : raw };
  }
  if (bytes.length >= 8) {
    const milliamps = signed(bytes).getInt16(5, true);
    delta = {
      ...delta,
      millivolts: uint16(bytes, 3),
      milliamps: milliamps === -1 ? null : milliamps,
      temperatureC: signed(bytes).getInt8(7),
    };
  }
  return delta;
}

export function decodeOralbButton(bytes: Uint8Array): OralbDelta {
  requireLength('FF06', bytes, [1, 2]);
  if (bytes.length === 2) {
    return { powerButton: uint8(bytes, 0) !== 0, modeButton: uint8(bytes, 1) !== 0 };
  }
  const code = uint8(bytes, 0);
  return { powerButton: code === 1, modeButton: code === 2 };
}

export function decodeOralbModeId(bytes: Uint8Array): OralbDelta {
  requireLength('FF07', bytes, [1]);
  return { modeId: uint8(bytes, 0) };
}

export function decodeOralbTimer(bytes: Uint8Array): OralbDelta {
  requireLength('FF08', bytes, [2]);
  return { timerS: uint8(bytes, 0) * 60 + uint8(bytes, 1) };
}

export function gattSector(code: number): OralbSector {
  if (code === SECTOR_LAST) {
    return { position: null, last: true };
  }
  return { position: code === SECTOR_NONE ? null : code + 1, last: false };
}

export function decodeOralbPacer(bytes: Uint8Array): OralbDelta {
  requireLength('FF09', bytes, [3]);
  return {
    sector: gattSector(uint8(bytes, 0)),
    secondsInSector: uint8(bytes, 1),
    sectorCount: uint8(bytes, 2),
  };
}

export function decodeOralbFace(bytes: Uint8Array): OralbDelta {
  requireLength('FF0A', bytes, [1]);
  return { face: uint8(bytes, 0) };
}

export function decodeOralbPressure(bytes: Uint8Array): OralbDelta {
  requireLength('FF0B', bytes, [1, 10]);
  const pressure = uint8(bytes, 0);
  if (bytes.length === 1) {
    return { pressure };
  }
  return {
    pressure,
    pressureStamp: uint16(bytes, 1),
    forceRaw: signed(bytes).getInt16(3, true),
    angleCentidegrees: uint16(bytes, 5),
    driveTarget: uint16(bytes, 7),
    pressureId: uint8(bytes, 9),
  };
}

export function decodeOralbClock(bytes: Uint8Array): OralbDelta {
  requireLength('FF22', bytes, [4]);
  return { clock: uint32(bytes, 0) };
}

export function decodeOralbModeSlots(bytes: Uint8Array): OralbDelta {
  requireLength('FF25', bytes, [SLOT_COUNT]);
  return { modeSlots: [...bytes].map((id) => (id === EMPTY_SLOT ? null : id)) };
}

export function decodeOralbPacerConfig(bytes: Uint8Array): OralbDelta {
  requireLength('FF26', bytes, [SLOT_COUNT]);
  const seconds = [...bytes];
  const used = seconds.filter((value) => value > 0 && value !== EMPTY_SLOT);
  return {
    pacerS: seconds,
    pacerSectorCount: used.length,
    pacerTargetS: used.reduce((sum, value) => sum + value, 0),
  };
}

export function decodeOralbRingColour(bytes: Uint8Array): OralbDelta {
  requireLength('FF2B', bytes, [4]);
  return { ringDrive: [uint8(bytes, 0), uint8(bytes, 1), uint8(bytes, 2), uint8(bytes, 3)] };
}

export function decodeOralbHead(bytes: Uint8Array): OralbDelta {
  requireLength('FF2D', bytes, [5]);
  return {
    headState: uint8(bytes, 0),
    headDaysLeft: uint16(bytes, 1),
    headSecondsLeft: uint16(bytes, 3),
  };
}

type Decoder = (bytes: Uint8Array, protocol: number | null) => OralbDelta;

const DECODERS: ReadonlyMap<string, Decoder> = new Map<string, Decoder>([
  [ORALB_KEY.mac, decodeOralbMac],
  [ORALB_KEY.deviceInfo, decodeOralbDeviceInfo],
  [ORALB_KEY.user, decodeOralbUser],
  [ORALB_KEY.state, decodeOralbState],
  [ORALB_KEY.battery, decodeOralbBattery],
  [ORALB_KEY.button, decodeOralbButton],
  [ORALB_KEY.mode, decodeOralbModeId],
  [ORALB_KEY.timer, decodeOralbTimer],
  [ORALB_KEY.sector, decodeOralbPacer],
  [ORALB_KEY.face, decodeOralbFace],
  [ORALB_KEY.pressure, decodeOralbPressure],
  [ORALB_KEY.clock, decodeOralbClock],
  [ORALB_KEY.modeSlots, decodeOralbModeSlots],
  [ORALB_KEY.pacer, decodeOralbPacerConfig],
  [ORALB_KEY.ringColour, decodeOralbRingColour],
  [ORALB_KEY.head, decodeOralbHead],
  [
    ORALB_KEY.session,
    (bytes, protocol): OralbDelta => ({ record: decodeOralbRecord(bytes, protocol ?? 0) }),
  ],
]);

export const ORALB_DECODED_KEYS: readonly string[] = [...DECODERS.keys()];

export function decodeOralbValue(
  characteristic: string,
  bytes: Uint8Array,
  protocol: number | null,
): OralbDelta | null {
  return DECODERS.get(oralbShortOf(characteristic))?.(bytes, protocol) ?? null;
}
