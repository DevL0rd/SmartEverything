import { SHELLY_DYNAMIC_FIELDS_EXTRA } from './shelly-presence-dynamic-fields-extra';
import { SHELLY_ADVANCED_OPERATIONS } from './shelly-presence-advanced-operations';
import { SHELLY_NETWORK_FIELDS_EXTRA } from './shelly-presence-network-fields-extra';
import { SHELLY_DYNAMIC_FIELDS_0 } from './shelly-presence-dynamic-fields-0';
import { SHELLY_DYNAMIC_FIELDS_1 } from './shelly-presence-dynamic-fields-1';
import { SHELLY_DYNAMIC_FIELDS_2 } from './shelly-presence-dynamic-fields-2';
import { SHELLY_DYNAMIC_FIELDS_3 } from './shelly-presence-dynamic-fields-3';
import { SHELLY_DYNAMIC_OPERATIONS } from './shelly-presence-operation-dynamic';
import { SHELLY_OPERATIONS_0 } from './shelly-presence-operation-descriptors-0';
import { SHELLY_OPERATIONS_1 } from './shelly-presence-operation-descriptors-1';
import { SHELLY_OPERATIONS_2 } from './shelly-presence-operation-descriptors-2';
import { SHELLY_PRESENCE_NETWORK_FIELDS } from './shelly-presence-network-fields';
import { SHELLY_PRESENCE_CORE_FIELDS } from './shelly-presence-core-fields';
import { SHELLY_PRESENCE_ZONE_FIELDS } from './shelly-presence-zone-fields';
import { SHELLY_PRESENCE_CORE_OPERATIONS } from './shelly-presence-core-operations';
import type {
  ShellyPresenceField,
  ShellyPresenceOperationDescriptor,
} from './shelly-presence-fields';

export const SHELLY_PRESENCE_FIELDS: readonly ShellyPresenceField[] = [
  ...SHELLY_PRESENCE_CORE_FIELDS,
  ...SHELLY_PRESENCE_ZONE_FIELDS,
  ...SHELLY_PRESENCE_NETWORK_FIELDS,
  ...SHELLY_NETWORK_FIELDS_EXTRA,
  ...SHELLY_DYNAMIC_FIELDS_0,
  ...SHELLY_DYNAMIC_FIELDS_1,
  ...SHELLY_DYNAMIC_FIELDS_2,
  ...SHELLY_DYNAMIC_FIELDS_3,
  ...SHELLY_DYNAMIC_FIELDS_EXTRA,
];
export const SHELLY_PRESENCE_OPERATIONS: readonly ShellyPresenceOperationDescriptor[] = [
  ...SHELLY_PRESENCE_CORE_OPERATIONS,
  ...SHELLY_OPERATIONS_0,
  ...SHELLY_OPERATIONS_1,
  ...SHELLY_OPERATIONS_2,
  ...SHELLY_DYNAMIC_OPERATIONS,
  ...SHELLY_ADVANCED_OPERATIONS,
];
