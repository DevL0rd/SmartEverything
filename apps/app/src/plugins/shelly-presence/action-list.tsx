import type { ReactNode } from 'react';
import {
  SHELLY_ACTIONS,
  SHELLY_SETTING_ROWS,
  shellyOperation,
  type ShellyAction,
  type ShellyDevice,
  type ShellyPage,
} from '@smarteverything/shelly';
import { NavRow } from '../../components/rows';
import { List } from '../../components/section';
import { actionAvailable } from './presence-operation';
import { RESOURCE_ACTIONS } from './resource-pages';

const SETTING_ACTIONS: ReadonlySet<ShellyAction> = new Set(
  SHELLY_SETTING_ROWS.map((row) => row.action),
);
const OWN_EDITOR_ACTIONS: ReadonlySet<ShellyAction> = new Set([
  'add_zone',
  'delete_zone',
  'live_track',
  'firmware_upload_start',
  'firmware_upload_write',
  'virtual_delete',
  'bthome_delete_device',
  'bthome_delete_sensor',
  'bthome_known_objects',
]);

export function isListedAction(action: ShellyAction): boolean {
  return (
    !SETTING_ACTIONS.has(action) && !OWN_EDITOR_ACTIONS.has(action) && !RESOURCE_ACTIONS.has(action)
  );
}

export function listedActions(sensor: ShellyDevice, page: ShellyPage): readonly ShellyAction[] {
  return SHELLY_ACTIONS.filter(
    (action) =>
      shellyOperation(action).page === page &&
      actionAvailable(sensor, action) &&
      isListedAction(action),
  );
}

export function ActionList({
  actions,
  choose,
}: {
  readonly actions: readonly ShellyAction[];
  readonly choose: (action: ShellyAction) => void;
}): ReactNode {
  return actions.length === 0 ? null : (
    <List title="Actions">
      {actions.map((action) => (
        <NavRow
          key={action}
          title={shellyOperation(action).title}
          onPress={() => {
            choose(action);
          }}
        />
      ))}
    </List>
  );
}
