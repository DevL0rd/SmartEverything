import { bottleSerialOf } from '@smarteverything/domain';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';
import { entryConfigOf } from './config';
import { drinkItemsOf, saveDrinks, type DrinksDeps } from './drinks';
import { curveOf, replayAll, type ReadingsDeps } from './readings';

interface RederiveResult {
  readonly readings: number;
  readonly added: number;
  readonly corrected: number;
}

export function rederive(
  deps: ReadingsDeps & { readonly drinks: DrinksDeps },
  deviceId: string,
  entry: LocalDeviceEntry,
): RederiveResult {
  const config = entryConfigOf(entry);
  const rows = replayAll(deps, deviceId, curveOf(config));
  const outcome = saveDrinks(
    deps.drinks,
    { deviceId, serial: bottleSerialOf(entry.externalId), binding: config.binding },
    drinkItemsOf(rows),
  );
  return { readings: rows.length, added: outcome.created.length, corrected: outcome.corrected };
}
