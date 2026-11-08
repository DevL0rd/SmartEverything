import { isAppliance } from '../features/devices';
import type { Device } from '../store/state';

export type RemoteActionPlace = 'remote' | 'buttons' | 'settings' | 'add-appliance';

export interface RemoteAction {
  readonly key: string;
  readonly title: string;
  readonly keywords: readonly string[];
  readonly applies: (device: Device) => boolean;
  readonly place: RemoteActionPlace;
}

function ofKinds(...kinds: readonly Device['kind'][]): (device: Device) => boolean {
  return (device) => kinds.includes(device.kind);
}

const REMOTE_ACTIONS: readonly RemoteAction[] = [
  {
    key: 'scene',
    title: 'Make a scene',
    keywords: ['scene', 'record', 'sequence', 'several keys', 'macro', 'routine', 'ir'],
    applies: ofKinds('ir_blaster'),
    place: 'remote',
  },
  {
    key: 'check',
    title: 'Check with a plug',
    keywords: [
      'check',
      'confirm',
      'verify',
      'plug',
      'power draw',
      'sensor',
      'assumed',
      'really on',
    ],
    applies: ofKinds('ir_blaster', 'ir_remote'),
    place: 'remote',
  },
  {
    key: 'wrong',
    title: 'It didn’t work?',
    keywords: ['mark as on', 'mark as off', 'press again', 'correct', 'wrong state', 'assumed'],
    applies: ofKinds('ir_blaster', 'ir_remote'),
    place: 'remote',
  },
  {
    key: 'learn',
    title: 'Learn a button',
    keywords: ['learn', 'teach', 'record a button', 'add a remote', 'infrared', 'ir', 'copy'],
    applies: ofKinds('ir_blaster'),
    place: 'settings',
  },
  {
    key: 'promote',
    title: 'Make it a device',
    keywords: ['promote', 'own device', 'appliance', 'convert', 'air conditioner', 'remote', 'ir'],
    applies: ofKinds('ir_blaster'),
    place: 'settings',
  },
  {
    key: 'add-appliance',
    title: 'Add an appliance',
    keywords: [
      'add appliance',
      'air conditioner',
      'tv',
      'fan',
      'library',
      'known model',
      'brand',
      'smartir',
      'flipper',
      'ir',
    ],
    applies: ofKinds('ir_blaster'),
    place: 'add-appliance',
  },
  {
    key: 'learn-buttons',
    title: 'Learn buttons',
    keywords: ['learn', 'teach', 'buttons', 'power', 'temp up', 'temp down', 'mode', 'fan', 'ir'],
    applies: isAppliance,
    place: 'buttons',
  },
  {
    key: 'rebind',
    title: 'Use another blaster',
    keywords: ['blaster', 're-bind', 'rebind', 'switch blaster', 'offline', 'send through', 'ir'],
    applies: isAppliance,
    place: 'buttons',
  },
];

export function remoteActionsOf(device: Device): readonly RemoteAction[] {
  return REMOTE_ACTIONS.filter((candidate) => candidate.applies(device));
}
