import type { BleContentFilter, LocalDeviceSetup, LocalDriver } from '@smarteverything/domain';
import type { LocalDeviceEntry } from '../../store/repositories/local-devices';
import type { ResolvedSetup } from '../setup-types';
import { oralbBrand } from '../oralb/brand';
import { sonicareBrand } from '../sonicare/brand';
import type { BrushBrand } from './brand';

class UnknownBrushDriverError extends Error {
  override readonly name = 'UnknownBrushDriverError';

  constructor(readonly driver: string) {
    super(`There is no toothbrush brand for the driver ${driver}.`);
  }
}

export function brushBrands(): readonly BrushBrand[] {
  return [sonicareBrand, oralbBrand];
}

function brandOfDriver(driver: LocalDriver): BrushBrand | undefined {
  return brushBrands().find((brand) => brand.driver === driver);
}

export function brandOfEntry(entry: Pick<LocalDeviceEntry, 'driver'>): BrushBrand {
  const brand = brandOfDriver(entry.driver);
  if (brand === undefined) {
    throw new UnknownBrushDriverError(entry.driver);
  }
  return brand;
}

export function isBrushEntry(entry: Pick<LocalDeviceEntry, 'driver'>): boolean {
  return brandOfDriver(entry.driver) !== undefined;
}

export function brushContentFilters(entries: readonly LocalDeviceEntry[]): BleContentFilter[] {
  return brushBrands().flatMap((brand) => brand.contentFilters(entries));
}

export function brushSetupFor(setup: LocalDeviceSetup): Promise<ResolvedSetup> {
  const brand = brandOfDriver(setup.driver);
  if (brand === undefined) {
    throw new UnknownBrushDriverError(setup.driver);
  }
  return brand.setup(setup);
}
