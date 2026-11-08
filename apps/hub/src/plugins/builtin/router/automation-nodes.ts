import { actionNode, input, optionalInput, output, ports, queryNode } from '../automation-kit';
import {
  CLIENT_ACCESS_TOOL,
  LIST_CLIENTS_TOOL,
  LIST_SPEED_TESTS_TOOL,
  NOT_SET_UP,
  RESTART_TOOL,
  RUN_SPEED_TEST_TOOL,
  UPDATE_CLIENT_TOOL,
} from './automation-tools';
import { CLIENT, CONNECTIONS, INSTANT, PERSON, maybe, record } from './automation-parts';

const COMMAND_TIMEOUT = { default: 30_000, max: 120_000 } as const;
const READ_TIMEOUT = { default: 10_000, max: 60_000 } as const;
const SPEED_TEST_TIMEOUT = { default: 60_000, max: 120_000 } as const;

const ACCESS_CHOICES = [
  { id: 'disconnect', label: 'Disconnect from Wi-Fi' },
  { id: 'block', label: 'Block internet access' },
  { id: 'unblock', label: 'Allow internet access again' },
] as const;

const RESTART_CHOICES = [
  { id: 'wifi', label: 'Wi-Fi' },
  { id: 'router', label: 'The whole router' },
] as const;

const MBPS = { min: 0, unit: 'Mbps' } as const;
const MS = { min: 0, unit: 'ms' } as const;

export const SPEED_TEST = actionNode({
  id: 'speed_test',
  version: 1,
  title: 'Run a speed test',
  description:
    'Measures the internet download, upload, latency and jitter against Cloudflare. It takes about 20 seconds, so it always waits for the result.',
  icon: 'gauge',
  keywords: ['router', 'speed', 'internet', 'bandwidth', 'latency'],
  summary: 'Run an internet speed test',
  tool: RUN_SPEED_TEST_TOOL,
  inputs: {},
  outputs: {
    download: output(ports.number(MBPS), {
      title: 'Download',
      description: 'Download speed in megabits per second.',
      from: '/result/downloadMbps',
    }),
    upload: output(ports.number(MBPS), {
      title: 'Upload',
      description: 'Upload speed in megabits per second.',
      from: '/result/uploadMbps',
    }),
    latency: output(ports.number(MS), {
      title: 'Latency',
      description: 'The fastest round trip in milliseconds.',
      from: '/result/pingMs',
    }),
    jitter: output(ports.number(MS), {
      title: 'Jitter',
      description: 'How much the round trip varies, in milliseconds.',
      from: '/result/jitterMs',
    }),
    at: output(INSTANT, {
      title: 'Measured at',
      description: 'When the test finished.',
      from: '/result/at',
    }),
  },
  args: {},
  mode: { default: 'wait_for_result', allowed: ['wait_for_result'] },
  timeout: SPEED_TEST_TIMEOUT,
  errors: { [NOT_SET_UP]: 'Unreachable' },
  access: 'member',
});

export const CLIENT_ACCESS = actionNode({
  id: 'client_access',
  version: 1,
  title: 'Network access for a device',
  description:
    'Disconnects a device from Wi-Fi, blocks its internet access or gives a blocked device its access back.',
  icon: 'wifi-off',
  keywords: ['router', 'block', 'unblock', 'disconnect', 'kick', 'parental', 'internet'],
  summary: '{action}: {device}',
  tool: CLIENT_ACCESS_TOOL,
  inputs: {
    device: input(CLIENT.kind, { title: 'Device', description: 'The device on the network.' }),
    action: input(ports.choice(ACCESS_CHOICES), {
      title: 'Action',
      description: 'Disconnect it, block its internet access or allow it again.',
    }),
  },
  args: { client: { record: { action: { port: 'action' }, mac: { port: 'device' } } } },
  timeout: COMMAND_TIMEOUT,
  errors: { [NOT_SET_UP]: 'Unreachable' },
  access: 'owner',
  retry: 'idempotent',
});

export const RESTART = actionNode({
  id: 'restart',
  version: 1,
  title: 'Restart the router or Wi-Fi',
  description:
    'Restarts every Wi-Fi radio, which drops everyone on Wi-Fi for about a minute, or restarts the whole router.',
  icon: 'power',
  keywords: ['router', 'reboot', 'restart', 'wifi', 'wireless'],
  summary: 'Restart {what}',
  tool: RESTART_TOOL,
  inputs: {
    what: input(ports.choice(RESTART_CHOICES), {
      title: 'What to restart',
      description: 'The Wi-Fi radios or the whole router.',
    }),
  },
  args: { what: { port: 'what' } },
  timeout: COMMAND_TIMEOUT,
  errors: { [NOT_SET_UP]: 'Unreachable' },
  access: 'owner',
});

export const RENAME_CLIENT = actionNode({
  id: 'rename_client',
  version: 1,
  title: 'Rename a network device',
  description:
    'Gives a device a new name on the router. A name is 1 to 32 characters and has no angle brackets.',
  icon: 'pencil',
  keywords: ['router', 'rename', 'name', 'device', 'client'],
  summary: 'Rename {device} to {name}',
  tool: UPDATE_CLIENT_TOOL,
  inputs: {
    device: input(CLIENT.kind, { title: 'Device', description: 'The device to rename.' }),
    name: input(ports.text(), { title: 'New name', description: 'The name the router shows.' }),
  },
  args: {
    client: {
      record: { action: { lit: 'rename' }, mac: { port: 'device' }, name: { port: 'name' } },
    },
  },
  timeout: COMMAND_TIMEOUT,
  errors: { [NOT_SET_UP]: 'Unreachable' },
  access: 'owner',
  retry: 'idempotent',
});

export const CLIENTS = queryNode({
  id: 'clients',
  version: 1,
  title: 'Devices on the network',
  description:
    'Every device the router knows, optionally only the online ones or only those of one person.',
  icon: 'network',
  keywords: ['router', 'devices', 'clients', 'online', 'network', 'people'],
  summary: 'Devices on the network of {person}',
  tool: LIST_CLIENTS_TOOL,
  inputs: {
    onlyOnline: optionalInput(ports.boolean(), {
      title: 'Only online',
      description: 'Leave out devices that are not connected now.',
      default: false,
    }),
    person: optionalInput(PERSON.kind, {
      title: 'Person',
      description: 'Only the devices linked to this person.',
    }),
  },
  outputs: {
    devices: output(
      ports.list(
        record({
          mac: ports.text(),
          name: ports.text(),
          connected: ports.boolean(),
          blocked: ports.boolean(),
          ip: maybe(ports.text()),
          connection: maybe(ports.choice(CONNECTIONS)),
          lastSeen: maybe(INSTANT),
          profileId: maybe(PERSON.kind),
          personId: maybe(PERSON.kind),
        }),
      ),
      { title: 'Devices', description: 'The devices that match.', from: '/clients' },
    ),
    count: output(ports.number({ integer: true, min: 0 }), {
      title: 'Count',
      description: 'How many devices match.',
      from: '/count',
    }),
  },
  args: { onlineOnly: { port: 'onlyOnline' }, person: { port: 'person' } },
  timeout: READ_TIMEOUT,
  errors: { [NOT_SET_UP]: 'Unreachable' },
  access: 'member',
  retry: 'idempotent',
  budget: 'none',
});

export const LAST_SPEED_TEST = queryNode({
  id: 'last_speed_test',
  version: 1,
  title: 'Latest speed test',
  description: 'The newest finished internet speed test. It fails when none has run yet.',
  icon: 'gauge',
  keywords: ['router', 'speed', 'internet', 'last', 'history'],
  summary: 'Latest speed test',
  tool: LIST_SPEED_TESTS_TOOL,
  inputs: {},
  outputs: {
    download: output(ports.number(MBPS), {
      title: 'Download',
      description: 'Download speed in megabits per second.',
      from: '/tests/0/downloadMbps',
    }),
    upload: output(ports.number(MBPS), {
      title: 'Upload',
      description: 'Upload speed in megabits per second.',
      from: '/tests/0/uploadMbps',
    }),
    latency: output(ports.number(MS), {
      title: 'Latency',
      description: 'The fastest round trip in milliseconds.',
      from: '/tests/0/pingMs',
    }),
    jitter: output(ports.number(MS), {
      title: 'Jitter',
      description: 'How much the round trip varies, in milliseconds.',
      from: '/tests/0/jitterMs',
    }),
    at: output(INSTANT, {
      title: 'Measured at',
      description: 'When the test finished.',
      from: '/tests/0/at',
    }),
  },
  args: {},
  timeout: READ_TIMEOUT,
  access: 'member',
  retry: 'idempotent',
  budget: 'none',
});
