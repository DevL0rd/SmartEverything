import type { Served } from './served-types';
export const SERVED_DEVICE_GROUPS = [
  [
    'get_device_groups',
    'devices',
    'read',
    'Get device groups',
    'Named device groups with their ids and member device ids.',
    { part: 'list_device_groups' },
  ],
  [
    'edit_device_group',
    'devices',
    'control',
    'Edit a device group',
    'Create, rename, change members or remove a named device group. Removing the group keeps every device.',
    {
      key: 'action',
      parts: {
        create: 'create_device_group',
        update: 'update_device_group',
        remove: 'remove_device_group',
      },
    },
  ],
  [
    'control_device_target',
    'control',
    'control',
    'Control a room or device group',
    'Set a supported control on a room, named group or explicit device selection. Returns actual per-device outcomes and offline or unsupported members; use scale percent for normalized levels.',
    { part: 'control_device_target' },
  ],
] as const satisfies readonly Served[];
