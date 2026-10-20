import {
  ApiError,
  JSON_VALUE,
  ORALB_DRIVER,
  ORALB_PROTOCOLS,
  brushSettingsOf,
  oralbDefaultModelOf,
  oralbExternalId,
  oralbModelKey,
  type LocalDeviceSetup,
} from '@smarteverything/domain';
import type { ResolvedSetup } from '../setup-types';

type OralbSetup = Extract<LocalDeviceSetup, { driver: 'oralb_io' }>;

function sameAddress(a: string, b: string): boolean {
  return a.toUpperCase() === b.toUpperCase();
}

export function oralbSetup(setup: OralbSetup): ResolvedSetup {
  const { identity } = setup;
  if (!ORALB_PROTOCOLS.some((protocol) => protocol === identity.protocol)) {
    throw new ApiError(
      'invalid_request',
      `This Oral-B toothbrush speaks protocol ${String(identity.protocol)}, which is not an iO protocol (6 to 9) and is not supported.`,
    );
  }
  if (!sameAddress(identity.address, identity.advertAddress)) {
    throw new ApiError(
      'invalid_request',
      'The Bluetooth address the brush reports does not match the address it advertises, so it cannot be followed between uses.',
    );
  }
  const settings = brushSettingsOf(
    { personId: setup.profileId, oralb: { model: oralbDefaultModelOf(identity.modelId) } },
    'oralb',
  );
  return {
    entry: {
      externalId: oralbExternalId(identity),
      driver: ORALB_DRIVER,
      address: identity.address,
      name: setup.name,
      config: {
        model: oralbModelKey(identity),
        room: setup.room,
        identity: JSON_VALUE.parse(identity),
        settings: JSON_VALUE.parse(settings),
        schedule: null,
      },
    },
    key: null,
    replaces: null,
  };
}
