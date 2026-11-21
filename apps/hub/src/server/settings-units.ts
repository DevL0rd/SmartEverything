import {
  applyHistorySettingsChange,
  applyTriggerSettingsChange,
  type HistorySettingsChange,
  type LaundryNoticeChange,
  type PauseChoiceMs,
  type TriggerSettingsChange,
} from '@smarteverything/domain';
import { storeUnit } from '../store/host/unit';
import type { HomeChange, NetworkChange, PublicUrlOutcome } from '../store/repositories/settings';

export interface ListeningChange {
  readonly earHost: string | null | undefined;
  readonly pause: PauseChoiceMs | undefined;
}

export const SETTINGS_WRITE_UNITS = {
  settingsUpdateHome: storeUnit((store, change: HomeChange) => store.settings.updateHome(change)),
  settingsUpdateNetwork: storeUnit((store, change: NetworkChange) =>
    store.settings.updateNetwork(change),
  ),
  settingsSetPublicUrl: storeUnit((store, { url }: { readonly url: string | null }) =>
    store.settings.setPublicUrl(url),
  ),
  settingsRecordPublicUrlCheck: storeUnit(
    (store, { url, outcome }: { readonly url: string; readonly outcome: PublicUrlOutcome }) =>
      store.settings.recordPublicUrlCheck(url, outcome),
  ),
  settingsSetPushProject: storeUnit((store, { projectId }: { readonly projectId: string | null }) =>
    store.settings.setPushProject(projectId),
  ),
  settingsListening: storeUnit((store, { earHost, pause }: ListeningChange) => {
    if (earHost !== undefined) store.settings.setEarHost(earHost);
    return pause === undefined ? store.settings.read() : store.settings.setEndOfSpeechPause(pause);
  }),
  settingsHistory: storeUnit((store, change: HistorySettingsChange) =>
    store.settings.setHistorySettings(
      applyHistorySettingsChange(store.settings.read().history_settings, change),
    ),
  ),
  settingsTriggers: storeUnit((store, change: TriggerSettingsChange) =>
    store.settings.setTriggerSettings(
      applyTriggerSettingsChange(store.settings.read().trigger_settings, change),
    ),
  ),
  settingsRecordRefill: storeUnit((store, { deviceId }: { readonly deviceId: string }) =>
    store.settings.recordRefill(deviceId),
  ),
  settingsLaundryNotice: storeUnit(
    (
      store,
      { deviceId, change }: { readonly deviceId: string; readonly change: LaundryNoticeChange },
    ) => store.settings.changeLaundryNotice(deviceId, change),
  ),
} as const;
