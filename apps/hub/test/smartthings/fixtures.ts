import type { ProviderModule, StoredAccount } from '../../src/adapters/contract';
import { createSmartThingsModule } from '../../src/adapters/smartthings/index';
import type { SmartThingsIo } from '../../src/adapters/smartthings/http';
import { SmartThingsWebhooks } from '../../src/adapters/smartthings/webhooks';

export const API = 'https://api.smartthings.com';

export const NOW = Date.parse('2026-10-08T12:00:00.000Z');

const CONFIG = { clientId: 'client-1', clientSecret: 'secret-1' };

export function moduleWith(
  io: SmartThingsIo,
  webhooks: SmartThingsWebhooks = new SmartThingsWebhooks(),
): ProviderModule<'smartthings'> {
  return createSmartThingsModule({ app: () => CONFIG, webhooks, io });
}

export function accountWith(overrides: Record<string, string | null> = {}): StoredAccount {
  return {
    label: 'SmartThings: Home',
    secrets: {
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresAt: '2026-10-09T12:00:00.000Z',
      refreshedAt: '2026-10-08T12:00:00.000Z',
      scope: 'r:devices:* x:devices:* r:locations:*',
      installedAppId: 'app-1',
      ...overrides,
    },
  };
}

export const TOKEN_RESPONSE = {
  access_token: 'access-2',
  token_type: 'bearer',
  refresh_token: 'refresh-2',
  expires_in: 86400,
  scope: 'r:devices:* x:devices:* r:locations:*',
  installed_app_id: 'app-1',
};

export const LOCATIONS = { items: [{ locationId: 'loc-1', name: 'Home' }], _links: null };

export const ROOMS = {
  items: [{ roomId: 'room-1', locationId: 'loc-1', name: 'Lounge' }],
  _links: null,
};

export const LAMP = {
  deviceId: 'lamp-1',
  label: 'Lamp',
  manufacturerName: 'Lumen',
  presentationId: 'lamp',
  locationId: 'loc-1',
  roomId: 'room-1',
  components: [
    {
      id: 'main',
      categories: [{ name: 'Light', categoryType: 'manufacturer' }],
      capabilities: [
        { id: 'switch', version: 1, status: { switch: { value: 'on' } } },
        { id: 'switchLevel', version: 1, status: { level: { value: 40, unit: '%' } } },
        { id: 'refresh', version: 1 },
      ],
    },
  ],
  healthState: { state: 'ONLINE' },
};

export const SENSOR = {
  deviceId: 'sensor-1',
  label: 'Hall sensor',
  manufacturerName: 'Acme',
  locationId: 'loc-1',
  components: [
    {
      id: 'main',
      categories: [{ name: 'MotionSensor', categoryType: 'manufacturer' }],
      capabilities: [
        { id: 'motionSensor', version: 1, status: { motion: { value: 'inactive' } } },
        { id: 'temperatureMeasurement', version: 1 },
      ],
    },
  ],
};

export const REFRESH_DEFINITION = {
  id: 'refresh',
  version: 1,
  status: 'live',
  name: 'Refresh',
  attributes: {},
  commands: { refresh: { name: 'refresh', arguments: [] } },
};

export const DEVICE_LIST_URL = `${API}/v1/devices?includeStatus=true&includeHealth=true`;
