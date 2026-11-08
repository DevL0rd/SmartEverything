import { POWER_MODES, SERVICE_OPERATIONS } from '../node/computer-system';
import { COMPUTER_CONTROL_KINDS } from './computer-control';
import {
  BOOLEAN,
  COMPUTER,
  SEND_EFFECT,
  SENT,
  choice,
  picker,
  text,
  toggle,
} from './computer-port-kit';
import { defineNodeKind, type NodeKind } from './define';

export const SYSTEM_SETTING_CHOICES = [
  { id: 'power_mode', label: 'Set the power mode' },
  { id: 'dnd', label: 'Turn do not disturb on or off' },
  { id: 'keyboard_layout', label: 'Switch the keyboard layout' },
  { id: 'wifi', label: 'Turn Wi-Fi on or off' },
  { id: 'wifi_connect', label: 'Connect to a Wi-Fi network' },
  { id: 'bluetooth', label: 'Turn Bluetooth on or off' },
  { id: 'bluetooth_device', label: 'Connect or disconnect a Bluetooth device' },
  { id: 'startup_app', label: 'Turn a startup app on or off' },
  { id: 'service', label: 'Start, stop or restart a service' },
] as const;

export const POWER_MODE_CHOICES = POWER_MODES.map((id) => ({
  id,
  label: id === 'power_saver' ? 'Power saver' : id.charAt(0).toUpperCase() + id.slice(1),
}));

export const SERVICE_OPERATION_CHOICES = SERVICE_OPERATIONS.map((id) => ({
  id,
  label: id.charAt(0).toUpperCase() + id.slice(1),
}));

export const APP_ACTION_CHOICES = [
  { id: 'open', label: 'Open' },
  { id: 'close', label: 'Close' },
  { id: 'focus', label: 'Bring to the front' },
  { id: 'minimise', label: 'Minimise' },
] as const;

const computerSystem = defineNodeKind({
  id: 'computer.system',
  name: 'Computer settings',
  category: 'computers',
  icon: 'settings',
  class: 'effect',
  description:
    'Changes a setting of a computer: the power mode, do not disturb, the keyboard layout, Wi-Fi and which network it uses, Bluetooth and which device is connected, whether a startup app starts at login, or starts, stops or restarts a service. Pick the setting, then fill the field it uses. Waiting continues when the computer has made the change; sending continues as soon as it was asked.',
  inputs: [
    COMPUTER,
    {
      ...choice('setting', SYSTEM_SETTING_CHOICES, 'Setting', 'What to change.'),
      required: true,
      summary: true,
    },
    choice('mode', POWER_MODE_CHOICES, 'Power mode', 'The power mode. Used by Set the power mode.'),
    toggle(
      'enabled',
      'On',
      'Whether it is on. Used by do not disturb, Wi-Fi, Bluetooth and startup apps.',
    ),
    picker(
      'layout',
      'computer.keyboard_layouts',
      'Layout',
      'The keyboard layout. Used by Switch the keyboard layout.',
    ),
    picker(
      'network',
      'computer.networks',
      'Network',
      'The saved Wi-Fi network to join. Used by Connect to a Wi-Fi network.',
    ),
    picker(
      'device',
      'computer.bluetooth_devices',
      'Bluetooth device',
      'The Bluetooth device. Used by Connect or disconnect a Bluetooth device.',
    ),
    toggle(
      'connected',
      'Connected',
      'Whether the device is connected. Used by Connect or disconnect a Bluetooth device.',
    ),
    picker(
      'startupApp',
      'computer.startup_apps',
      'Startup app',
      'The startup app. Used by Turn a startup app on or off.',
    ),
    picker(
      'unit',
      'computer.services',
      'Service',
      'The service to change. Used by Start, stop or restart a service.',
    ),
    choice(
      'operation',
      SERVICE_OPERATION_CHOICES,
      'Operation',
      'What to do with the service. Used by Start, stop or restart a service.',
    ),
  ],
  outputs: SENT,
  exits: ['next'],
  effect: SEND_EFFECT,
  summary: 'Change {setting} on {computer}',
  keywords: [
    'power mode',
    'do not disturb',
    'dnd',
    'keyboard',
    'layout',
    'wifi',
    'bluetooth',
    'startup',
    'service',
    'systemctl',
    'restart',
    'computer',
  ],
  access: 'member',
  tier: 'v1.1',
});

const computerApp = defineNodeKind({
  id: 'computer.app',
  name: 'Computer app',
  category: 'computers',
  icon: 'grid',
  class: 'effect',
  description:
    'Opens, closes, brings to the front or minimises an app on a computer. The app is picked from the apps installed on it. Closing asks the app to quit; force closes an app that hangs, and unsaved work can be lost. Bringing to the front uses the first window of the app and minimising uses every window of it; both fail when the app has no window open.',
  inputs: [
    COMPUTER,
    {
      ...choice('action', APP_ACTION_CHOICES, 'Action', 'What to do with the app.'),
      required: true,
      summary: true,
    },
    {
      ...picker('app', 'computer.apps', 'App', 'The app, from the apps installed on the computer.'),
      required: true,
      summary: true,
    },
    {
      name: 'force',
      type: BOOLEAN,
      required: false,
      default: false,
      static: true,
      description:
        'Close an app that hangs. Unsaved work can be lost. Used by Close; leave off for a normal quit.',
      ui: { label: 'Force' },
    },
  ],
  outputs: SENT,
  exits: ['next'],
  effect: SEND_EFFECT,
  summary: '{action} {app} on {computer}',
  keywords: [
    'app',
    'open',
    'launch',
    'start',
    'close',
    'quit',
    'kill',
    'focus',
    'minimise',
    'window',
  ],
  access: 'member',
  tier: 'v1.1',
});

const computerOpen = defineNodeKind({
  id: 'computer.open',
  name: 'Open on computer',
  category: 'computers',
  icon: 'externalLink',
  class: 'effect',
  description:
    'Opens a web, mail or phone link, or a file or folder by its full path, on a computer with the program it normally opens with. Give a link or a path, not both.',
  inputs: [
    COMPUTER,
    {
      ...text('url', 'Link', 'A web, mail or phone link. Give a link or a path.'),
      summary: true,
    },
    {
      ...text(
        'path',
        'File or folder',
        'The full path of a file or folder. Give a link or a path.',
      ),
      summary: true,
    },
  ],
  outputs: SENT,
  exits: ['next'],
  effect: SEND_EFFECT,
  summary: 'Open {url} or {path} on {computer}',
  keywords: ['open', 'url', 'link', 'website', 'file', 'folder', 'browser', 'path'],
  access: 'member',
  tier: 'v1.1',
});

export const COMPUTER_SYSTEM_KINDS: readonly NodeKind[] = [
  computerSystem,
  computerApp,
  computerOpen,
  ...COMPUTER_CONTROL_KINDS,
];
