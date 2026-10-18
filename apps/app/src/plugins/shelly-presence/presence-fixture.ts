import {
  SHELLY_DEVICE,
  SHELLY_SETTING_ROWS,
  type ShellyAction,
  type ShellyDevice,
} from '@smarteverything/shelly';

interface Overrides {
  readonly actions?: readonly ShellyAction[];
  readonly components?: readonly {
    readonly key: string;
    readonly component: string;
    readonly config: Readonly<Record<string, unknown>>;
  }[];
}

const SETTING_IDS = [
  'presence.enable',
  'presence.sensor.height',
  'wifi.sta.ssid',
  'wifi.ap.enable',
];

const BASE = {
  id: 'radar-1',
  externalId: 'shelly-presence:radar-1',
  name: 'Hall radar',
  address: 'http://127.0.0.1',
  info: {
    id: 'radar-1',
    mac: 'AABBCC',
    model: 'S4SN-0U61X',
    gen: 4,
    fw_id: 'x',
    ver: '1',
    app: 'presence',
    auth_en: false,
  },
  connection: { state: 'online', reason: null },
  observedAt: null,
  config: { enable: true, main_zone: 'presencezone:200', sensor: { height: 2.4 } },
  status: {},
  revision: 1,
  zones: [
    {
      key: 'presencezone:200',
      externalId: 'shelly-presence:radar-1',
      generation: 0,
      main: true,
      config: { id: 200, enable: true, area: [] },
      status: { id: 200, value: false, num_objects: 0 },
    },
    {
      key: 'presencezone:201',
      externalId: 'shelly-presence:radar-1:201:0',
      generation: 0,
      main: false,
      config: { id: 201, name: 'Desk', enable: true, area: [] },
      status: { id: 201, value: false, num_objects: 0 },
    },
  ],
  light: [],
  tracks: [],
  tracksAt: null,
  methods: [],
  componentKeys: [],
  discoveredBthome: [],
};

export function presenceFixture(overrides: Overrides = {}): ShellyDevice {
  const rowFeatures = SHELLY_SETTING_ROWS.filter((row) => SETTING_IDS.includes(row.id)).map(
    (row) => ({ id: row.id, page: row.page, available: true, reason: null }),
  );
  const actionFeatures = (overrides.actions ?? []).map((action) => ({
    id: action,
    page: 'presence-diagnostics',
    available: true,
    reason: null,
  }));
  return SHELLY_DEVICE.parse({
    ...BASE,
    features: [...rowFeatures, ...actionFeatures],
    components: (overrides.components ?? []).map((component) => ({ ...component, status: null })),
  });
}
