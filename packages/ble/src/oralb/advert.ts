import { uint8 } from '../bytes';
import type { OralbDelta, OralbSector } from './delta';
import { requireAtLeast } from './errors';
import { requireIoProtocol } from './modes';

export const ORALB_ADVERT_LENGTH = 11;

const HIGH_PRESSURE_BIT = 0x80;

const POWER_BIT = 0x08;

const MODE_BIT = 0x04;

const SECTOR_MASK = 0x07;

const SECTOR_LAST = 7;

const FACE_MASK = 0x07;

export interface OralbAdvert {
  readonly protocol: number;
  readonly modelId: number;
  readonly firmware: number;
  readonly state: number;
  readonly status: number;
  readonly pressure: 'normal' | 'high';
  readonly powerButton: boolean;
  readonly modeButton: boolean;
  readonly timerS: number;
  readonly modeId: number;
  readonly sector: OralbSector;
  readonly face: number;
  readonly secondsInSector: number;
  readonly sectorCount: number;
}

export function advertSector(code: number): OralbSector {
  if (code === SECTOR_LAST) {
    return { position: null, last: true };
  }
  return { position: code === 0 ? null : code, last: false };
}

export function decodeOralbAdvert(data: Uint8Array): OralbAdvert {
  requireAtLeast('advert', data, ORALB_ADVERT_LENGTH);
  const protocol = requireIoProtocol(uint8(data, 0));
  const status = uint8(data, 4);
  const sectorByte = uint8(data, 8);
  return {
    protocol,
    modelId: uint8(data, 1),
    firmware: uint8(data, 2),
    state: uint8(data, 3),
    status,
    pressure: (status & HIGH_PRESSURE_BIT) === 0 ? 'normal' : 'high',
    powerButton: (status & POWER_BIT) !== 0,
    modeButton: (status & MODE_BIT) !== 0,
    timerS: uint8(data, 5) * 60 + uint8(data, 6),
    modeId: uint8(data, 7),
    sector: advertSector(sectorByte & SECTOR_MASK),
    face: (sectorByte >> 3) & FACE_MASK,
    secondsInSector: uint8(data, 9),
    sectorCount: uint8(data, 10),
  };
}

export function advertDelta(advert: OralbAdvert): OralbDelta {
  return {
    protocol: advert.protocol,
    modelId: advert.modelId,
    firmware: advert.firmware,
    state: advert.state,
    statusBits: advert.status,
    pressure: advert.pressure === 'high' ? 2 : 1,
    powerButton: advert.powerButton,
    modeButton: advert.modeButton,
    timerS: advert.timerS,
    modeId: advert.modeId,
    sector: advert.sector,
    face: advert.face,
    secondsInSector: advert.secondsInSector,
    sectorCount: advert.sectorCount,
  };
}

export function oralbAdvertDelta(data: Uint8Array): OralbDelta {
  return advertDelta(decodeOralbAdvert(data));
}
