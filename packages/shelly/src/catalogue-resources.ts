import { JSON_VALUE } from '@smarteverything/domain';
import { z } from 'zod';
import {
  BTHOME_DEVICE_ADD,
  BTHOME_DEVICE_PATCH,
  BTHOME_SENSOR_ADD,
  BTHOME_SENSOR_PATCH,
  DURATION,
  ID,
  KEY_PATTERN,
  OFFSET,
  SCHEDULE_INPUT,
  SCRIPT_FILE,
  VIRTUAL_CONFIG,
  VIRTUAL_CONFIG_METHODS,
  VIRTUAL_ID,
  VIRTUAL_SET_METHODS,
  VIRTUAL_VALUE,
  WEBHOOK_INPUT,
} from './catalogue-schemas';
import { SHELLY_COMPONENT_KEY } from './primitives';
import { dispatching, keyworded, operation, member, revisioned } from './operation';

export const SHELLY_RESOURCE_OPERATIONS = {
  schedule_create: revisioned(
    operation('Schedule.Create', 'Create on-device schedule', ['presence-schedules', 'create'], {
      schedule: SCHEDULE_INPUT,
    }),
  ),
  schedule_update: revisioned(
    operation('Schedule.Update', 'Update on-device schedule', ['presence-schedules', 'edit'], {
      id: ID,
      schedule: SCHEDULE_INPUT.partial(),
    }),
  ),
  schedule_delete: revisioned(
    operation('Schedule.Delete', 'Delete on-device schedule', ['presence-schedules', 'delete'], {
      id: ID,
    }),
  ),
  schedule_delete_all: revisioned(
    operation(
      'Schedule.DeleteAll',
      'Delete all on-device schedules',
      ['presence-schedules', 'delete-all'],
      {},
    ),
  ),
  schedule_eval: member(
    operation('Schedule.Eval', 'Preview schedule times', ['presence-schedules', 'preview'], {
      timespec: z.string().min(1),
      now: z.number().optional(),
    }),
  ),
  webhook_create: revisioned(
    operation('Webhook.Create', 'Create on-device action', ['presence-actions', 'create'], {
      webhook: WEBHOOK_INPUT,
    }),
  ),
  webhook_update: revisioned(
    operation('Webhook.Update', 'Update on-device action', ['presence-actions', 'edit'], {
      id: ID,
      webhook: WEBHOOK_INPUT.partial(),
    }),
  ),
  webhook_delete: revisioned(
    operation('Webhook.Delete', 'Delete on-device action', ['presence-actions', 'delete'], {
      id: ID,
    }),
  ),
  webhook_delete_all: revisioned(
    operation(
      'Webhook.DeleteAll',
      'Delete all on-device actions',
      ['presence-actions', 'delete-all'],
      {},
    ),
  ),
  script_create: operation('Script.Create', 'Create script', ['presence-scripts', 'create'], {
    name: z.string().min(1),
  }),
  script_config: operation(
    'Script.SetConfig',
    'Save script settings',
    ['presence-scripts', 'settings'],
    {
      id: ID,
      config: z.strictObject({
        name: z.string().nullable().optional(),
        enable: z.boolean().optional(),
      }),
    },
  ),
  script_put_code: operation('Script.PutCode', 'Save script code', ['presence-scripts', 'source'], {
    id: ID,
    code: z.string().min(1).meta({ secret: true }),
    append: z.boolean().optional(),
  }),
  script_start: operation('Script.Start', 'Start script', ['presence-scripts', 'start'], {
    id: ID,
  }),
  script_stop: operation('Script.Stop', 'Stop script', ['presence-scripts', 'stop'], { id: ID }),
  script_delete: operation('Script.Delete', 'Delete script', ['presence-scripts', 'delete'], {
    id: ID,
  }),
  script_eval: operation(
    'Script.Eval',
    'Evaluate script expression',
    ['presence-scripts', 'evaluate'],
    { id: ID, code: z.string().min(1).meta({ secret: true }) },
  ),
  script_code: operation('Script.GetCode', 'Read script code', ['presence-scripts', 'source'], {
    id: ID,
  }),
  script_library: keyworded(
    operation(
      'Script.Create',
      'Browse manufacturer script library',
      ['presence-scripts', 'library'],
      {},
    ),
    ['script', 'library', 'examples'],
  ),
  script_example: keyworded(
    operation(
      'Script.Create',
      'Read manufacturer script example',
      ['presence-scripts', 'library'],
      { fname: SCRIPT_FILE },
    ),
    ['script', 'example', 'source'],
  ),
  kvs_set: operation('KVS.Set', 'Save stored value', ['presence-storage', 'save'], {
    key: z.string().min(1),
    value: JSON_VALUE.meta({ secret: true }),
    etag: z.string().optional(),
  }),
  kvs_delete: operation('KVS.Delete', 'Delete stored value', ['presence-storage', 'delete'], {
    key: z.string().min(1),
    etag: z.string().optional(),
  }),
  kvs_get: keyworded(
    operation('KVS.Get', 'Read one stored value', ['presence-storage', 'stored-value'], {
      key: z.string().min(1).meta({ title: 'Stored key' }),
    }),
    ['stored value', 'key', 'etag'],
  ),
  kvs_list: member(
    keyworded(
      operation('KVS.List', 'Read stored keys', ['presence-storage', 'stored-values'], {
        match: KEY_PATTERN.optional(),
        offset: OFFSET.optional(),
      }),
      ['keys', 'filter', 'match'],
    ),
  ),
  kvs_many: keyworded(
    operation('KVS.GetMany', 'Read matching stored values', ['presence-storage', 'stored-values'], {
      match: KEY_PATTERN.optional(),
      offset: OFFSET.optional(),
    }),
    ['stored values', 'filter', 'match'],
  ),
  virtual_add: operation(
    'Virtual.Add',
    'Add virtual component',
    ['presence-components', 'virtual'],
    { config: VIRTUAL_CONFIG, id: VIRTUAL_ID.optional() },
  ),
  virtual_delete: operation(
    'Virtual.Delete',
    'Delete virtual component',
    ['presence-components', 'virtual'],
    { key: SHELLY_COMPONENT_KEY },
  ),
  virtual_config: dispatching(
    operation('Boolean.SetConfig', 'Edit virtual component', ['presence-components', 'virtual'], {
      id: ID,
      config: VIRTUAL_CONFIG,
    }),
    'config',
    VIRTUAL_CONFIG_METHODS,
  ),
  virtual_set: member(
    dispatching(
      operation('Boolean.Set', 'Set virtual value', ['presence-components', 'virtual'], {
        id: ID,
        setting: VIRTUAL_VALUE,
      }),
      'setting',
      VIRTUAL_SET_METHODS,
    ),
  ),
  virtual_button: member(
    operation('Button.Trigger', 'Emit virtual button event', ['presence-components', 'virtual'], {
      id: ID,
      event: z.enum(['single_push', 'double_push', 'triple_push', 'long_push']),
    }),
  ),
  virtual_toggle: member(
    keyworded(
      operation('Boolean.Toggle', 'Toggle virtual boolean', ['presence-components', 'virtual'], {
        id: VIRTUAL_ID,
      }),
      ['virtual', 'boolean', 'toggle'],
    ),
  ),
  bthome_discover: operation(
    'BTHome.StartDeviceDiscovery',
    'Discover BTHome devices',
    ['presence-components', 'bthome'],
    { duration: DURATION.optional() },
  ),
  bthome_objects: member(
    operation(
      'BTHome.GetObjectInfos',
      'Read BTHome object descriptions',
      ['presence-components', 'bthome'],
      {
        obj_ids: z.array(z.int().nonnegative()).meta({ title: 'Bluetooth object IDs' }),
        offset: OFFSET.optional(),
      },
    ),
  ),
  bthome_add_device: operation(
    'BTHome.AddDevice',
    'Add BTHome device',
    ['presence-components', 'bthome'],
    { config: BTHOME_DEVICE_ADD, id: VIRTUAL_ID.optional() },
  ),
  bthome_delete_device: operation(
    'BTHome.DeleteDevice',
    'Delete BTHome device',
    ['presence-components', 'bthome'],
    { id: ID },
  ),
  bthome_device_config: operation(
    'BTHomeDevice.SetConfig',
    'Edit BTHome device',
    ['presence-components', 'bthome'],
    { id: ID, config: BTHOME_DEVICE_PATCH },
  ),
  bthome_known_objects: member(
    operation(
      'BTHomeDevice.GetKnownObjects',
      'Read BTHome known objects',
      ['presence-components', 'bthome'],
      { id: ID },
    ),
  ),
  bthome_add_sensor: operation(
    'BTHome.AddSensor',
    'Add BTHome sensor',
    ['presence-components', 'bthome'],
    { config: BTHOME_SENSOR_ADD, id: VIRTUAL_ID.optional() },
  ),
  bthome_delete_sensor: operation(
    'BTHome.DeleteSensor',
    'Delete BTHome sensor',
    ['presence-components', 'bthome'],
    { id: ID },
  ),
  bthome_sensor_config: operation(
    'BTHomeSensor.SetConfig',
    'Edit BTHome sensor',
    ['presence-components', 'bthome'],
    { id: ID, config: BTHOME_SENSOR_PATCH },
  ),
  bthome_reset_counter: operation(
    'BTHome.ResetEncryptionCounter',
    'Reset BTHome encryption counter',
    ['presence-components', 'bthome'],
    {},
  ),
  bthome_set_config: operation(
    'BTHome.SetConfig',
    'Enable BTHome',
    ['presence-components', 'bthome'],
    { config: z.strictObject({ enable: z.boolean() }) },
  ),
};
