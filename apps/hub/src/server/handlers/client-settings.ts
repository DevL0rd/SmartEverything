import { API_ENDPOINTS as E } from '@smarteverything/domain';
import { requestSequence } from '../request-signal';
import type { LayoutOwner } from '../../store/repositories/personal';
import type { Store } from '../../store/store';
import { clientOf, profileIdOf, type Caller } from '../auth';
import { DONE_REPLY, bound } from '../router';

function ownerOf(store: Store, caller: Caller): LayoutOwner {
  return { clientId: clientOf(caller).id, profileId: profileIdOf(store, caller) };
}

export const clientRoutes = (store: Store) =>
  ({
    readLayout: bound(E.readLayout, ({ params, caller }) => ({
      layout: store.personal.layout(ownerOf(store, caller), params.page)?.layout ?? null,
    })),
    saveLayout: bound(E.saveLayout, ({ params, body, caller }) =>
      store.personal.saveLayout(ownerOf(store, caller), params.page, body.layout, requestSequence),
    ),
    listPushTargets: bound(E.listPushTargets, () => store.personal.pushTargets()),
    savePushTarget: bound(E.savePushTarget, ({ body, caller }) =>
      store.personal.savePushTarget(body.token, clientOf(caller).id, body.platform),
    ),
    removePushTarget: bound(E.removePushTarget, ({ body, caller }) => {
      store.personal.removePushTarget(body.token, clientOf(caller).id);
      return DONE_REPLY;
    }),
  }) as const;
