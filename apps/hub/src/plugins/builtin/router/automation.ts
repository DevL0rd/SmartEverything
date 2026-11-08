import { automation, eventTrigger, input, ports, streamValue } from '../automation-kit';
import {
  CLIENT,
  CLIENT_JOINED,
  CLIENT_LEFT,
  CONNECTIONS,
  INSTANT,
  PERSON,
  PERSON_ARRIVED,
  PERSON_LEFT,
  maybe,
} from './automation-parts';
import {
  CLIENTS,
  CLIENT_ACCESS,
  LAST_SPEED_TEST,
  RENAME_CLIENT,
  RESTART,
  SPEED_TEST,
} from './automation-nodes';
import { SNAPSHOT_STREAM } from './runtime';

export {
  CLIENT_JOINED,
  CLIENT_LEFT,
  CLIENT_PICKER,
  PEOPLE_PICKER,
  PERSON_ARRIVED,
  PERSON_LEFT,
} from './automation-parts';

const CLIENT_FILTERS = {
  device: {
    kind: CLIENT.kind,
    title: 'Device',
    description: 'Only this device.',
    match: 'mac',
  },
  person: {
    kind: PERSON.kind,
    title: 'Person',
    description: 'Only devices linked to this person.',
    match: 'person_id',
  },
} as const;

const CLIENT_OUTPUTS = {
  mac: { kind: ports.text(), title: 'Address', from: 'mac' },
  name: { kind: ports.text(), title: 'Name', from: 'name' },
  person: { kind: maybe(ports.ref('person')), title: 'Person', from: 'profile_id' },
} as const;

const CLIENT_JOINED_TRIGGER = eventTrigger({
  id: 'client_joined',
  version: 1,
  title: 'Device joined the network',
  description: 'Fires when a device connects to the network, optionally one device or one person.',
  icon: 'wifi',
  keywords: ['router', 'device', 'joined', 'connected', 'network', 'arrives'],
  summary: 'Device joined the network: {device}',
  event: CLIENT_JOINED,
  filters: CLIENT_FILTERS,
  outputs: CLIENT_OUTPUTS,
});

const CLIENT_LEFT_TRIGGER = eventTrigger({
  id: 'client_left',
  version: 1,
  title: 'Device left the network',
  description:
    'Fires when a device has been gone from the network for a while, optionally one device or one person.',
  icon: 'wifi-off',
  keywords: ['router', 'device', 'left', 'disconnected', 'network', 'leaves'],
  summary: 'Device left the network: {device}',
  event: CLIENT_LEFT,
  filters: CLIENT_FILTERS,
  outputs: CLIENT_OUTPUTS,
});

const PRESENCE_TRIGGER = 'trigger.presence';

const PERSON_OUTPUTS = {
  person: { kind: ports.ref('person'), title: 'Person', from: 'profile_id' },
  name: { kind: ports.text(), title: 'Name', from: 'name' },
} as const;

const PERSON_ARRIVED_TRIGGER = eventTrigger({
  id: 'person_arrived',
  version: 1,
  title: 'A person arrives home',
  description: 'Fires when the router sees a person arrive home. Use the presence trigger.',
  icon: 'user',
  keywords: ['router', 'person', 'arrives', 'home', 'presence'],
  summary: 'A person arrives home',
  event: PERSON_ARRIVED,
  outputs: PERSON_OUTPUTS,
  hidden: true,
  replacedBy: PRESENCE_TRIGGER,
});

const PERSON_LEFT_TRIGGER = eventTrigger({
  id: 'person_left',
  version: 1,
  title: 'A person leaves home',
  description: 'Fires when the router sees a person leave home. Use the presence trigger.',
  icon: 'user',
  keywords: ['router', 'person', 'leaves', 'home', 'presence'],
  summary: 'A person leaves home',
  event: PERSON_LEFT,
  outputs: PERSON_OUTPUTS,
  hidden: true,
  replacedBy: PRESENCE_TRIGGER,
});

const DEVICE_INPUT = {
  device: input(CLIENT.kind, { title: 'Device', description: 'The device on the network.' }),
};

const CLIENT_VALUE = streamValue({
  id: 'client',
  version: 1,
  title: 'Network device',
  description: 'What the router knows about one device right now.',
  icon: 'laptop',
  keywords: ['router', 'device', 'online', 'ip', 'client'],
  summary: 'Network device {device}',
  inputs: DEVICE_INPUT,
  stream: SNAPSHOT_STREAM,
  select: { list: '/clients', key: '/mac', port: 'device' },
  outputs: {
    online: { kind: ports.boolean(), from: '/connected' },
    name: { kind: ports.text(), from: '/name' },
    ip: { kind: maybe(ports.text()), from: '/ip' },
    connection: { kind: maybe(ports.choice(CONNECTIONS)), from: '/connection' },
    lastSeen: { kind: maybe(INSTANT), from: '/lastSeen' },
    person: { kind: maybe(ports.ref('person')), from: '/profileId' },
  },
});

const WIFI_LINK_VALUE = streamValue({
  id: 'wifi_link',
  version: 1,
  title: 'Wi-Fi signal of a device',
  description:
    'The Wi-Fi signal strength and band of a device that is connected over Wi-Fi right now.',
  icon: 'signal',
  keywords: ['router', 'wifi', 'signal', 'rssi', 'dbm', 'band'],
  summary: 'Wi-Fi signal of {device}',
  inputs: DEVICE_INPUT,
  stream: SNAPSHOT_STREAM,
  select: { list: '/stations', key: '/mac', port: 'device' },
  outputs: {
    signal: { kind: maybe(ports.number({ unit: 'dBm' })), from: '/rssiDbm' },
    band: { kind: ports.text(), from: '/band' },
  },
});

export const ROUTER_AUTOMATION = automation({
  nodes: [SPEED_TEST, CLIENT_ACCESS, RESTART, RENAME_CLIENT, CLIENTS, LAST_SPEED_TEST],
  triggers: [
    CLIENT_JOINED_TRIGGER,
    CLIENT_LEFT_TRIGGER,
    PERSON_ARRIVED_TRIGGER,
    PERSON_LEFT_TRIGGER,
  ],
  values: [CLIENT_VALUE, WIFI_LINK_VALUE],
  entities: [CLIENT, PERSON],
  autoTriggers: false,
});
