import {
  WATCH_CONFIG,
  type WatchActionRequest,
  type WatchConfig,
  type WatchSetting,
} from '@smarteverything/domain';
import { deviceEdit, type Edit } from '../../store/optimistic';
import type { Device, StoreState } from '../../store/state';

type SettingValue = Extract<WatchActionRequest, { type: 'set_setting' }>['value'];

export function settingWith(setting: WatchSetting, value: SettingValue): WatchSetting {
  if (setting.kind === 'switch')
    return typeof value === 'boolean' ? { ...setting, value } : setting;
  if (setting.kind === 'number') return typeof value === 'number' ? { ...setting, value } : setting;
  if (setting.kind === 'choice') return typeof value === 'string' ? { ...setting, value } : setting;
  return typeof value === 'string' ? { ...setting, value } : setting;
}

export function configAfter(config: WatchConfig, action: WatchActionRequest): WatchConfig | null {
  if (action.type === 'set_setting') {
    return {
      ...config,
      settings: config.settings.map((setting) =>
        setting.key === action.key ? settingWith(setting, action.value) : setting,
      ),
    };
  }
  if (action.type === 'set_watch_face') {
    return {
      ...config,
      faces: config.faces.map((face) => ({ ...face, active: face.id === action.id })),
    };
  }
  if (action.type === 'delete_watch_face') {
    return { ...config, faces: config.faces.filter((face) => face.id !== action.id) };
  }
  return null;
}

export function watchEdits(
  state: StoreState,
  deviceId: string,
  actions: readonly WatchActionRequest[],
): readonly Edit[] {
  const device: Device | undefined = state.tables.devices.byId[deviceId];
  if (device === undefined) return [];
  const current = WATCH_CONFIG.safeParse(device.details['config']);
  if (!current.success) return [];
  let config = current.data;
  for (const action of actions) {
    const next = configAfter(config, action);
    if (next === null) return [];
    config = next;
  }
  return [deviceEdit(device, { ...device, details: { ...device.details, config } })];
}
