import { identityOf, familyOf, UnknownTreadmillFamilyError } from '@smarteverything/ble';
import {
  ApiError,
  JSON_VALUE,
  settingsOf,
  treadmillExternalId,
  type LocalDeviceSetup,
} from '@smarteverything/domain';
import type { ResolvedSetup } from '../setup-types';
import { TREADMILL_DRIVER } from './config';

const MODEL_PREFIX = 'kingsmith.treadmill.';

const DEFAULT_MODEL = 'unknown';

function modelSlug(model: string | null): string {
  const slug = (model ?? '').toLowerCase().replaceAll(/[^a-z0-9]+/g, '');
  return slug === '' ? DEFAULT_MODEL : slug;
}

export function treadmillSetup(
  setup: Extract<LocalDeviceSetup, { driver: 'kingsmith_treadmill' }>,
): ResolvedSetup {
  try {
    const family = familyOf(setup.gatt);
    const identity = identityOf(setup.gatt);
    return {
      entry: {
        externalId: treadmillExternalId(setup.address),
        driver: TREADMILL_DRIVER,
        address: setup.address,
        name: setup.name,
        config: {
          model: `${MODEL_PREFIX}${modelSlug(identity.model)}`,
          room: setup.room,
          family,
          gatt: JSON_VALUE.parse(setup.gatt),
          settings: settingsOf(undefined),
        },
      },
      key: null,
      replaces: null,
    };
  } catch (cause) {
    if (cause instanceof UnknownTreadmillFamilyError) {
      throw new ApiError('invalid_request', cause.message);
    }
    throw cause;
  }
}
