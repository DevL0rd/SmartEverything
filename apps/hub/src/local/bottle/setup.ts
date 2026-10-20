import {
  BOTTLE_DRIVER,
  BOTTLE_MODEL_PREFIX,
  DEFAULT_FILTER,
  UNBOUND,
  bottleExternalId,
  type BottleDeviceInformation,
  type LocalDeviceSetup,
} from '@smarteverything/domain';
import type { ResolvedSetup } from '../setup-types';
import { storedConfigOf, type BottleEntryConfig } from './config';

const BRITA_PATTERN = /brita/iu;

export function modelOf(dis: BottleDeviceInformation | null): string {
  const text = `${dis?.manufacturer ?? ''} ${dis?.model ?? ''}`;
  return `${BOTTLE_MODEL_PREFIX}${BRITA_PATTERN.test(text) ? 'iq' : 'purevis2'}`;
}

export function bottleSetup(
  setup: Extract<LocalDeviceSetup, { driver: 'larq_bottle' }>,
  moment: { readonly now: Date; readonly today: string },
): ResolvedSetup {
  const config: BottleEntryConfig = {
    model: modelOf(setup.dis),
    room: setup.room,
    body: setup.body,
    calibration: null,
    filter: {
      ...DEFAULT_FILTER,
      installed: setup.filter,
      installedOn: setup.filter ? moment.today : null,
    },
    binding:
      setup.profileId === null
        ? UNBOUND
        : {
            profileId: setup.profileId,
            boundBy: null,
            boundAt: moment.now.toISOString(),
            keptAt: null,
          },
    desired: { reminder: null, quiet: null },
    unsupported: { firmware: null, requests: [] },
  };
  return {
    entry: {
      externalId: bottleExternalId(setup.serial),
      driver: BOTTLE_DRIVER,
      address: setup.serial,
      name: setup.name,
      config: storedConfigOf(config),
    },
    key: null,
    replaces: null,
  };
}
