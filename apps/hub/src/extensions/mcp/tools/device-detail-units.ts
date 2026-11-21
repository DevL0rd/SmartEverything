import {
  EMPTY_IR_REMOTE_STATE,
  type CameraRow,
  type DeviceModelView,
  type DeviceRow,
  type DeviceScope,
  type IrRemoteState,
  type StateRow,
  type TelevisionSettingsRow,
} from '@smarteverything/domain';
import type { PhoneViewer } from '../../../phones/phone-detail';
import { visibleRows } from '../../../phones/phone-visibility';
import {
  modelResolveSources,
  modelViewOf,
  resolveDeviceModel,
  type ModelResolveSources,
} from '../../../models/device-model';
import type { HostStore } from '../../../store/host/host-store';
import { storeUnit } from '../../../store/host/unit';
import { placedFrom } from './targets';

export interface DeviceFacts {
  readonly states: StateRow[];
  readonly camera: CameraRow | null;
  readonly model: DeviceModelView;
  readonly television: Record<string, unknown> | null;
  readonly infrared: Record<string, unknown> | null;
}

export interface DeviceFactsRequest {
  readonly deviceIds: readonly string[];
  readonly scope: DeviceScope | null;
  readonly viewer: PhoneViewer;
}

const MODEL_SERVICES = new WeakMap<HostStore, ModelResolveSources>();

function modelOf(store: HostStore, device: DeviceRow): DeviceModelView {
  const services = MODEL_SERVICES.get(store) ?? modelResolveSources(store);
  MODEL_SERVICES.set(store, services);
  return modelViewOf(resolveDeviceModel(services, device).resolution);
}

function directLinkOf(
  settings: TelevisionSettingsRow | undefined,
): { readonly address: string; readonly mac: string } | null {
  const host = settings?.direct_host ?? null;
  const mac = settings?.direct_mac ?? null;
  return host === null || mac === null ? null : { address: host, mac };
}

function televisionOf(store: HostStore, device: DeviceRow): Record<string, unknown> {
  const settings = store.televisionSettings.find(device.id);
  return {
    direct_link: directLinkOf(settings),
    wake_address: settings?.wake_macs[0] ?? null,
    last_wake_worked_at: settings?.wake_worked_at ?? null,
    input_names: settings?.input_names ?? {},
  };
}

function assumedState(store: HostStore, remoteId: string): IrRemoteState {
  return store.settings.read().ir_remotes[remoteId] ?? EMPTY_IR_REMOTE_STATE;
}

function infraredOf(
  store: HostStore,
  device: DeviceRow,
  scope: DeviceScope | null,
): Record<string, unknown> {
  if (device.kind === 'ir_remote') {
    return { assumed: assumedState(store, device.id) };
  }
  const deviceRemotes = placedFrom(store.rooms.list(), store.devices.list(), scope)
    .filter((placed) => placed.device.kind === 'ir_remote' && placed.device.parent_id === device.id)
    .map((placed) => ({ id: placed.device.id, name: placed.name }));
  const learned = store.infrared
    .remotes()
    .filter((remote) => remote.blaster_id === device.id)
    .map((remote) => ({ id: remote.id, name: remote.name }));
  return {
    remotes: [...deviceRemotes, ...learned].map((remote) => ({
      ...remote,
      assumed: assumedState(store, remote.id),
    })),
  };
}

function factsOf(
  store: HostStore,
  device: DeviceRow,
  { scope, viewer }: DeviceFactsRequest,
): DeviceFacts {
  return {
    states: visibleRows(store, viewer, store.state.ofDevice(device.id)),
    camera: store.cameras.find(device.id) ?? null,
    model: modelOf(store, device),
    television: device.kind === 'television' ? televisionOf(store, device) : null,
    infrared:
      device.kind === 'ir_blaster' || device.kind === 'ir_remote'
        ? infraredOf(store, device, scope)
        : null,
  };
}

export const MCP_DEVICE_FACTS_UNIT = storeUnit(
  (store, request: DeviceFactsRequest): Record<string, DeviceFacts> =>
    Object.fromEntries(
      request.deviceIds.map((id) => [id, factsOf(store, store.devices.byId(id), request)]),
    ),
);
