import { API_ENDPOINTS as E, ApiError, CLIENT_PREFS } from '@smarteverything/domain';
import type { PhoneNodes } from '../../phones/phone-nodes';
import { phoneIdentityOf } from '../../phones/phone-identity';
import { requestSequence } from '../request-signal';
import type { LayoutOwner } from '../../store/repositories/personal';
import type { Store } from '../../store/store';
import { clientOf, profileIdOf, type Caller } from '../auth';
import { DONE_REPLY, bound } from '../router';

function ownerOf(store: Store, caller: Caller): LayoutOwner {
  return { clientId: clientOf(caller).id, profileId: profileIdOf(store, caller) };
}

const DEVELOPER_LAYOUTS: ReadonlySet<string> = new Set([
  CLIENT_PREFS.developer_level.storageKey,
  CLIENT_PREFS.developer_flags.storageKey,
]);

function requireDeveloperOwner(caller: Caller, page: string): void {
  if (!DEVELOPER_LAYOUTS.has(page)) return;
  if (
    caller.kind !== 'client' ||
    caller.client.role !== 'owner' ||
    caller.via !== undefined ||
    caller.mcpOrigin !== undefined ||
    caller.pluginRequester !== undefined
  ) {
    throw new ApiError('forbidden', 'Only the owner can change developer settings in the app.');
  }
}

export const clientRoutes = (store: Store, phones: Pick<PhoneNodes, 'registerHardware'>) =>
  ({
    readLayout: bound(E.readLayout, ({ params, caller }) => ({
      layout: store.personal.layout(ownerOf(store, caller), params.page)?.layout ?? null,
    })),
    saveLayout: bound(E.saveLayout, ({ params, body, caller }) => {
      requireDeveloperOwner(caller, params.page);
      return store.personal.saveLayout(
        ownerOf(store, caller),
        params.page,
        body.layout,
        requestSequence,
      );
    }),
    listPushTargets: bound(E.listPushTargets, () => store.personal.pushTargets()),
    savePushTarget: bound(E.savePushTarget, async ({ body, caller }) => {
      const registration =
        body.hardware === undefined
          ? null
          : {
              phone: phoneIdentityOf(store, caller, 'registers its hardware'),
              hardware: body.hardware,
            };
      const target = store.personal.savePushTarget(body.token, clientOf(caller).id, body.platform);
      if (registration !== null) {
        await phones.registerHardware(registration.phone, registration.hardware);
      }
      return target;
    }),
    removePushTarget: bound(E.removePushTarget, ({ body, caller }) => {
      store.personal.removePushTarget(body.token, clientOf(caller).id);
      return DONE_REPLY;
    }),
  }) as const;
