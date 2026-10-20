import { NotASonicareError, brushIdentityOf } from '@smarteverything/ble';
import {
  ApiError,
  JSON_VALUE,
  MODEL_CHOICES,
  brushSettingsOf,
  sonicareExternalId,
  sonicareModelKey,
  type SonicareIdentity,
  type LocalDeviceSetup,
} from '@smarteverything/domain';
import type { ResolvedSetup } from '../setup-types';
import { SONICARE_DRIVER, effectiveIdentity } from './config';

type BrushSetup = Extract<LocalDeviceSetup, { driver: 'philips_sonicare' }>;

function identityFrom(setup: BrushSetup): SonicareIdentity {
  try {
    return brushIdentityOf(setup.gatt, { address: setup.address, bonded: setup.bonded, ports: [] });
  } catch (cause) {
    if (cause instanceof NotASonicareError) {
      throw new ApiError('invalid_request', cause.message);
    }
    throw cause;
  }
}

export function sonicareSetup(setup: BrushSetup): ResolvedSetup {
  const identity = identityFrom(setup);
  const choice =
    setup.modelKey === null
      ? undefined
      : MODEL_CHOICES.find((candidate) => candidate.key === setup.modelKey);
  if (setup.modelKey !== null && choice === undefined) {
    throw new ApiError('invalid_request', `There is no toothbrush model called ${setup.modelKey}.`);
  }
  const settings = brushSettingsOf({
    model: setup.modelKey,
    personId: setup.profileId,
  });
  return {
    entry: {
      externalId: sonicareExternalId(identity),
      driver: SONICARE_DRIVER,
      address: setup.address,
      name: setup.name,
      config: {
        model: sonicareModelKey(effectiveIdentity(identity, settings)),
        room: setup.room,
        identity: JSON_VALUE.parse(identity),
        settings: JSON_VALUE.parse(settings),
      },
    },
    key: null,
    replaces: null,
  };
}
