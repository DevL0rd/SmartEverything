import {
  API_ENDPOINTS as E,
  ApiError,
  applyHistorySettingsChange,
  applyTriggerSettingsChange,
} from '@smarteverything/domain';
import type { ServerContext } from '../context';
import { bound } from '../router';
import { clipboardRoutes } from './clipboard';
import { providerRoutes } from './providers';

export const settingsRoutes = (context: ServerContext, now: () => Date) =>
  ({
    ...providerRoutes(context),
    ...clipboardRoutes(context, now),
    readSettings: bound(E.readSettings, () => context.store.settings.read()),
    updateHome: bound(E.updateHome, ({ body }) => context.store.settings.updateHome(body)),
    updateNetwork: bound(E.updateNetwork, ({ body }) => context.store.settings.updateNetwork(body)),
    setPublicUrl: bound(E.setPublicUrl, ({ body }) =>
      context.store.settings.setPublicUrl(body.url),
    ),
    verifyPublicUrl: bound(E.verifyPublicUrl, () => context.publicUrl.verify()),
    setPushAccount: bound(E.setPushAccount, async ({ body }) => {
      await context.secrets.update((current) => ({
        ...current,
        pushServiceAccount: body.serviceAccount,
      }));
      return context.store.settings.setPushProject(body.serviceAccount.project_id);
    }),
    clearPushAccount: bound(E.clearPushAccount, async () => {
      await context.secrets.update((current) => ({ ...current, pushServiceAccount: null }));
      return context.store.settings.setPushProject(null);
    }),
    listProviders: bound(E.listProviders, () => context.store.providers.list()),
    updateListeningSettings: bound(E.updateListeningSettings, ({ body }) => {
      const { settings, devices } = context.store;
      const host = body.ear_host_device_id;
      if (typeof host === 'string' && devices.find(host)?.kind !== 'computer') {
        throw new ApiError('not_found', `No computer ${host}; list_devices shows the computers.`);
      }
      if (host !== undefined) settings.setEarHost(host);
      const pause = body.end_of_speech_pause_ms;
      return pause === undefined ? settings.read() : settings.setEndOfSpeechPause(pause);
    }),
    updateHistorySettings: bound(E.updateHistorySettings, ({ body }) => {
      const { settings } = context.store;
      const current = settings.read().history_settings;
      return settings.setHistorySettings(applyHistorySettingsChange(current, body));
    }),
    updateTriggerSettings: bound(E.updateTriggerSettings, ({ body }) => {
      const { settings } = context.store;
      const current = settings.read().trigger_settings;
      return settings.setTriggerSettings(applyTriggerSettingsChange(current, body));
    }),
  }) as const;
