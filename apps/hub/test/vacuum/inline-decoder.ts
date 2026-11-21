import { decodeVacuumMap, type MapDecoder } from '../../src/vacuum/map-decode';

export const INLINE_MAP_DECODER: MapDecoder = {
  decode: (job) => Promise.resolve(decodeVacuumMap(job)),
  close: () => Promise.resolve(),
};
