import { SHELLY_MANAGEMENT_ACTIONS as MANAGEMENT } from '@smarteverything/domain';
import { mappedAction, type ShellyActionMapper } from './action-plan';

export const MANAGEMENT_PLANS: readonly ShellyActionMapper[] = [
  mappedAction(MANAGEMENT[0], 'WiFi.Scan', () => ({})),
  mappedAction(MANAGEMENT[1], 'WiFi.ListAPClients', () => ({})),
  mappedAction(MANAGEMENT[2], 'BLE.ListPairedDevices', () => ({})),
  mappedAction(MANAGEMENT[3], 'BLE.StartPairing', (action) => ({ timeout: action.timeout })),
  mappedAction(MANAGEMENT[4], 'BLE.StopPairing', () => ({})),
  mappedAction(MANAGEMENT[5], 'BLE.DeletePairedDevice', (action) => ({ addr: action.addr })),
  mappedAction(MANAGEMENT[6], 'BLE.AdvertiseOnce', () => ({})),
  mappedAction(MANAGEMENT[7], 'BLE.CloudRelay.List', () => ({})),
  mappedAction(MANAGEMENT[8], 'BLE.CloudRelay.ListInfos', () => ({})),
  mappedAction(MANAGEMENT[9], 'BLE.StartAssociations', (action) => ({
    target: action.target,
    duration: action.duration,
    rssi_thr: action.rssi_thr,
  })),
  mappedAction(MANAGEMENT[10], 'BLE.StartBluTrvAssociations', (action) => ({
    blutrv_id: action.blutrv_id,
    duration: action.duration,
    rssi_thr: action.rssi_thr,
  })),
  mappedAction(MANAGEMENT[11], 'Matter.GetSetupCode', () => ({})),
  mappedAction(MANAGEMENT[12], 'Matter.FactoryReset', () => ({})),
  mappedAction(MANAGEMENT[13], 'Zigbee.StartNetworkSteering', () => ({})),
  mappedAction(MANAGEMENT[14], 'Shelly.Reboot', (action) => ({ delay_ms: action.delay_ms })),
  mappedAction(MANAGEMENT[15], 'Shelly.FactoryReset', () => ({})),
  mappedAction(MANAGEMENT[17], 'Shelly.CheckForUpdate', () => ({})),
  mappedAction(MANAGEMENT[18], 'Shelly.Update', (action) => action.update),
  mappedAction(MANAGEMENT[19], 'Shelly.ListProfiles', () => ({})),
  mappedAction(MANAGEMENT[20], 'Shelly.SetProfile', (action) => ({ name: action.name })),
  mappedAction(MANAGEMENT[21], 'Shelly.ListTimezones', (action) => ({ offset: action.offset })),
  mappedAction(MANAGEMENT[22], 'Shelly.DetectLocation', () => ({})),
  mappedAction(MANAGEMENT[23], 'Sys.SetTime', (action) => ({ unixtime: action.unixtime })),
  mappedAction(MANAGEMENT[26], 'HTTP.Request', (action) => ({
    method: action.method,
    url: action.url,
    body: action.body,
    headers: action.headers,
    timeout: action.timeout,
    ssl_ca: action.ssl_ca,
  })),
];
