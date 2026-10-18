import type { Served } from './served-types';
export const SERVED_DEVICE_GROUPS = [
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
    "Changes one control on every device of a room, a room's lights (families light), a device group or a list of devices. Lists the members that changed, failed or were skipped (offline, not supported, removed) with reasons and a headline when some did not change; scale percent takes levels as 0 to 100 and scope on changes only the members that are on.",
    { part: 'control_device_target' },
  ],
] as const satisfies readonly Served[];
