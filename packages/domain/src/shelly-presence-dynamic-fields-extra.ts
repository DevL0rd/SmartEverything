import type { ShellyPresenceField } from './shelly-presence-fields';
const VIRTUAL_TYPES = ['boolean', 'number', 'enum', 'text', 'button', 'group'] as const;
export const SHELLY_DYNAMIC_FIELDS_EXTRA: readonly ShellyPresenceField[] = VIRTUAL_TYPES.flatMap(
  (component): ShellyPresenceField[] => [
    {
      id: `${component}.meta.ui.name`,
      component,
      path: ['meta', 'ui', 'name'],
      title: 'Display name',
      value: { kind: 'text', maxLength: 64, nullable: true },
      action: 'virtual_config',
      permission: 'privileged',
      page: 'presence-components',
      focus: 'virtual',
      keywords: ['display name', 'appearance'],
    },
    ...(component === 'number'
      ? [
          {
            id: `${component}.meta.ui.step`,
            component,
            path: ['meta', 'ui', 'step'],
            title: 'Value step',
            value: { kind: 'number', min: Number.MIN_VALUE },
            action: 'virtual_config',
            permission: 'privileged',
            page: 'presence-components',
            focus: 'virtual',
            keywords: ['increment', 'step'],
          } satisfies ShellyPresenceField,
        ]
      : []),
  ],
);
