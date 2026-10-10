import { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { ServerContext } from '../context';
import { bound, type Bound } from '../router';

type SettingsRoutes = Record<
  | 'readSettings'
  | 'updateHome'
  | 'updateNetwork'
  | 'setPublicUrl'
  | 'verifyPublicUrl'
  | 'setPushAccount'
  | 'clearPushAccount'
  | 'listProviders'
  | 'sealingKey',
  Bound
>;

export function settingsRoutes(context: ServerContext): SettingsRoutes {
  const { store, secrets } = context;
  return {
    readSettings: bound(E.readSettings, () => store.settings.read()),
    updateHome: bound(E.updateHome, ({ body }) => store.settings.updateHome(body)),
    updateNetwork: bound(E.updateNetwork, ({ body }) => store.settings.updateNetwork(body)),
    setPublicUrl: bound(E.setPublicUrl, ({ body }) => store.settings.setPublicUrl(body.url)),
    verifyPublicUrl: bound(E.verifyPublicUrl, () => context.publicUrl.verify()),
    setPushAccount: bound(E.setPushAccount, async ({ body }) => {
      await secrets.update((current) => ({ ...current, pushServiceAccount: body.serviceAccount }));
      return store.settings.setPushProject(body.serviceAccount.project_id);
    }),
    clearPushAccount: bound(E.clearPushAccount, async () => {
      await secrets.update((current) => ({ ...current, pushServiceAccount: null }));
      return store.settings.setPushProject(null);
    }),
    listProviders: bound(E.listProviders, () => store.providers.list()),
    sealingKey: bound(E.sealingKey, () => ({ publicKey: secrets.sealingKeys().publicKey })),
  };
}
