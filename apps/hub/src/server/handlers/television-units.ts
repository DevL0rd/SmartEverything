import { screensOf } from '../../adapters/samsung-tv/screens';
import { storeUnit } from '../../store/host/unit';

export const TELEVISION_READ_UNITS = {
  televisionScreens: storeUnit((store, _input: null) => screensOf(store)),
} as const;
