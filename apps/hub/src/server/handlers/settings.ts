import { API_ENDPOINTS as E, ApiError } from '@smarteverything/domain';
import type { ServerContext } from '../context';
import { bound } from '../router';
import { clipboardRoutes } from './clipboard';
import { providerRoutes } from './providers';

const settingsChangeRoutes = (context: ServerContext) =>
  ({
    updateListeningSettings: bound(E.updateListeningSettings, ({ body }) => {
      const host = body.ear_host_device_id;
      if (
        typeof host === 'string' &&
        context.store.live.home.devices.find(host)?.kind !== 'computer'
      ) {
        throw new ApiError('not_found', `No computer ${host}; list_devices shows the computers.`);
      }
      return context.store.host.write('settingsListening', {
        earHost: host,
        pause: body.end_of_speech_pause_ms,
      });
    }),
    updateHistorySettings: bound(E.updateHistorySettings, ({ body }) =>
      context.store.host.write('settingsHistory', body),
    ),
    updateTriggerSettings: bound(E.updateTriggerSettings, ({ body }) =>
      context.store.host.write('settingsTriggers', body),
    ),
  }) as const;

export const settingsRoutes = (context: ServerContext, now: () => Date) =>
  ({
    ...providerRoutes(context),
    ...clipboardRoutes(context, now),
    readSettings: bound(E.readSettings, () => context.store.live.home.settings.read()),
    updateHome: bound(E.updateHome, ({ body }) =>
      context.store.host.write('settingsUpdateHome', body),
    ),
    updateNetwork: bound(E.updateNetwork, ({ body }) =>
      context.store.host.write('settingsUpdateNetwork', body),
    ),
    setPublicUrl: bound(E.setPublicUrl, ({ body }) =>
      context.store.host.write('settingsSetPublicUrl', { url: body.url }),
    ),
    verifyPublicUrl: bound(E.verifyPublicUrl, () => context.publicUrl.verify()),
    setPushAccount: bound(E.setPushAccount, async ({ body }) => {
      await context.secrets.update((current) => ({
        ...current,
        pushServiceAccount: body.serviceAccount,
      }));
      return context.store.host.write('settingsSetPushProject', {
        projectId: body.serviceAccount.project_id,
      });
    }),
    clearPushAccount: bound(E.clearPushAccount, async () => {
      await context.secrets.update((current) => ({ ...current, pushServiceAccount: null }));
      return context.store.host.write('settingsSetPushProject', { projectId: null });
    }),
    listProviders: bound(E.listProviders, () => context.store.host.call('providers', 'list')),
    readBuildSources: bound(E.readBuildSources, () =>
      context.store.host.read('buildSources', null),
    ),
    updateBuildSources: bound(E.updateBuildSources, ({ body }) =>
      context.store.host.write('buildSourcesUpdate', body),
    ),
    ...settingsChangeRoutes(context),
  }) as const;
