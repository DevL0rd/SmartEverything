import {
  AUTOMATION_VALUE_ROW,
  SCENE_ROW,
  type AutomationValueRow,
  type DeviceRow,
  type SceneRow,
} from '@smarteverything/domain';
import { deviceFixture } from '../../../store/device-fixture';
import type { Device } from '../../../store/state';
import type { Catalog } from '../data/use-automations';
import { DEVICES } from './test-devices';

const STAMP = '2026-10-17T00:00:00.000Z';
export const SCENE_ID = '30000000-0000-4000-8000-000000000001';
export const VALUE_ID = '30000000-0000-4000-8000-000000000002';
export const PERSON_ID = '30000000-0000-4000-8000-000000000003';
export const COMPUTER_ID = '30000000-0000-4000-8000-000000000004';

function fixtureDevices(): readonly Device[] {
  return DEVICES.map((device, index) =>
    deviceFixture(index, {
      id: device.id,
      kind: device.kind,
      name: device.label,
      capabilities: device.capabilities,
    } satisfies Partial<DeviceRow>),
  );
}

function sceneRow(): SceneRow {
  return SCENE_ROW.parse({
    id: SCENE_ID,
    name: 'Movie',
    icon: 'film',
    actions: [],
    position: 0,
    created_at: STAMP,
  });
}

export function valueRow(): AutomationValueRow {
  return AUTOMATION_VALUE_ROW.parse({
    id: VALUE_ID,
    content: { kind: 'number', name: 'Fan level', value: 2, bounds: { overflow: 'reject' } },
    revision: 1,
    created_at: STAMP,
    updated_at: STAMP,
  });
}

export function catalogFixture(change: Partial<Catalog> = {}): Catalog {
  const devices = fixtureDevices();
  const scenes = [sceneRow()];
  const values = [valueRow()];
  return {
    devices,
    allDevices: devices,
    scenes,
    people: [],
    chats: [],
    speakers: devices.slice(0, 1),
    wakeProfileId: PERSON_ID,
    names: { devices, scenes, people: [], chats: [], values },
    values,
    groups: [],
    rooms: [],
    automations: [],
    callable: [],
    inputs: [],
    ...change,
  };
}

export function computerDevice(): Device {
  return deviceFixture(20, {
    id: COMPUTER_ID,
    kind: 'computer',
    name: 'Desk PC',
    capabilities: [],
  } satisfies Partial<DeviceRow>);
}

export function withComputer(catalog: Catalog): Catalog {
  const computer = computerDevice();
  return {
    ...catalog,
    devices: [...catalog.devices, computer],
    allDevices: [...catalog.allDevices, computer],
    names: { ...catalog.names, devices: [...catalog.names.devices, computer] },
  };
}
