import { API_ENDPOINTS as E, PLUGIN_ID } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { listAiModels } from '../../../api/ai';
import { readPluginOptions } from '../../../api/plugin-admin';
import { api } from '../../../api/transport';
import {
  audioAppRows,
  audioDeviceRows,
  bluetoothDeviceRows,
  computerAppRows,
  displayRows,
  irButtonRows,
  irRemoteRows,
  keyboardLayoutRows,
  listeningRows,
  modelRows,
  phoneAppRows,
  pluginRows,
  processRows,
  serviceRows,
  signalRows,
  speechRows,
  startupAppRows,
  vacuumRoomRows,
  wifiNetworkRows,
} from './option-remote';
import type { OptionRow, RemoteFetch } from './option-types';

const log = new Logger('app.automations');

export class OptionsUnavailable extends Error {}

type Rows = Promise<readonly OptionRow[]>;

type Loader = (fetch: RemoteFetch) => Rows | null;

async function pluginOptions(pluginId: string, source: string, search: string): Rows {
  const id = PLUGIN_ID.safeParse(pluginId);
  if (!id.success) throw new OptionsUnavailable('That plugin is not available');
  const page = await readPluginOptions(id.data, source, search === '' ? {} : { q: search });
  if (page.state === 'unavailable') throw new OptionsUnavailable(page.message);
  return pluginRows(page.options);
}

async function phoneApps(deviceId: string): Rows {
  const detail = await api().call(E.readPhoneDetail, {
    params: { deviceId },
    query: { sections: ['apps'] },
  });
  return phoneAppRows(detail.apps?.installed ?? []);
}

async function keyboardLayouts(deviceId: string): Rows {
  const state = await api().call(E.readComputerSystem, { params: { deviceId } });
  if (state.keyboard === null) {
    throw new OptionsUnavailable('This computer cannot list its keyboard layouts');
  }
  return keyboardLayoutRows(state.keyboard.layouts, state.keyboard.current);
}

async function wifiNetworks(deviceId: string): Rows {
  const state = await api().call(E.readComputerSystem, { params: { deviceId } });
  if (state.wifi === null)
    throw new OptionsUnavailable('This computer cannot list its Wi-Fi networks');
  return wifiNetworkRows(state.wifi.networks);
}

async function bluetoothDevices(deviceId: string): Rows {
  const state = await api().call(E.readComputerSystem, { params: { deviceId } });
  if (state.bluetooth === null)
    throw new OptionsUnavailable('This computer cannot list its Bluetooth devices');
  return bluetoothDeviceRows(state.bluetooth.devices);
}

async function vacuumRooms(deviceId: string): Rows {
  const links = await api().call(E.listVacuumRoomLinks, { params: { deviceId } });
  return vacuumRoomRows(links.homeRooms);
}

const LOADERS: readonly Loader[] = [
  (f): Rows | null =>
    f.t === 'ir_remotes' ? api().call(E.listIrRemotes, {}).then(irRemoteRows) : null,
  (f): Rows | null =>
    f.t === 'ir_appliances' ? api().call(E.listIrAppliances, {}).then(irRemoteRows) : null,
  (f): Rows | null =>
    f.t === 'ir_buttons'
      ? api()
          .call(E.listIrCodes, {})
          .then((codes) => irButtonRows(codes, f.remoteId))
      : null,
  (f): Rows | null =>
    f.t === 'signals'
      ? api()
          .call(E.listSignalKinds, { query: { automationRuntime: true } })
          .then((sources) => signalRows(sources, f.level, f.source, f.kind))
      : null,
  (f): Rows | null =>
    f.t === 'speech'
      ? api()
          .call(E.listSpeechSources, {})
          .then((found) => speechRows(found.sources))
      : null,
  (f): Rows | null =>
    f.t === 'listening'
      ? api()
          .call(E.readListening, {})
          .then((view) => listeningRows(view.sources))
      : null,
  (f): Rows | null =>
    f.t === 'computer_apps'
      ? api()
          .call(E.listComputerApps, { params: { deviceId: f.deviceId } })
          .then((apps) => computerAppRows(apps.installed))
      : null,
  (f): Rows | null =>
    f.t === 'audio_devices'
      ? api()
          .call(E.readComputerAudio, { params: { deviceId: f.deviceId } })
          .then(audioDeviceRows)
      : null,
  (f): Rows | null =>
    f.t === 'audio_apps'
      ? api()
          .call(E.readComputerAudio, { params: { deviceId: f.deviceId } })
          .then((audio) => audioAppRows(audio.apps))
      : null,
  (f): Rows | null =>
    f.t === 'displays'
      ? api()
          .call(E.readComputerDisplays, { params: { deviceId: f.deviceId } })
          .then((state) => displayRows(state.outputs))
      : null,
  (f): Rows | null =>
    f.t === 'services'
      ? api()
          .call(E.readComputerServices, { params: { deviceId: f.deviceId } })
          .then((state) => serviceRows(state.services))
      : null,
  (f): Rows | null => (f.t === 'keyboard_layouts' ? keyboardLayouts(f.deviceId) : null),
  (f): Rows | null =>
    f.t === 'startup_apps'
      ? api()
          .call(E.readComputerStartup, { params: { deviceId: f.deviceId } })
          .then((state) => startupAppRows(state.entries))
      : null,
  (f): Rows | null =>
    f.t === 'processes'
      ? api()
          .call(E.listComputerProcesses, {
            params: { deviceId: f.deviceId },
            query: f.search === '' ? {} : { search: f.search },
          })
          .then((list) => processRows(list.processes))
      : null,
  (f): Rows | null => (f.t === 'wifi_networks' ? wifiNetworks(f.deviceId) : null),
  (f): Rows | null => (f.t === 'bluetooth_devices' ? bluetoothDevices(f.deviceId) : null),
  (f): Rows | null => (f.t === 'phone_apps' ? phoneApps(f.deviceId) : null),
  (f): Rows | null => (f.t === 'vacuum_rooms' ? vacuumRooms(f.deviceId) : null),
  (f): Rows | null =>
    f.t === 'models'
      ? listAiModels({ kind: f.kind, ...(f.search === '' ? {} : { q: f.search }) }).then((list) =>
          modelRows(list.models),
        )
      : null,
  (f): Rows | null => (f.t === 'plugin' ? pluginOptions(f.pluginId, f.source, f.search) : null),
];

export async function loadOptionRows(fetch: RemoteFetch): Rows {
  for (const loader of LOADERS) {
    const rows = loader(fetch);
    if (rows !== null) {
      return rows.catch((error: unknown) => {
        log.warn('automations.option_source_failed', { source: fetch.t, error });
        throw error;
      });
    }
  }
  throw new OptionsUnavailable('No list is available for this source');
}
