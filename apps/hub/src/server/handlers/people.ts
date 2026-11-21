import { removeProfileChats } from '../../assistant/remove-profile-chats';
import { API_ENDPOINTS as E, ApiError } from '@smarteverything/domain';
import { clientOf, profileIdOf, type Caller } from '../auth';
import type { ServerContext } from '../context';
import { DONE_REPLY, bound } from '../router';
import { assertMayChoosePerson } from '../person-access';

function mayChange(caller: Caller, profileId: string): void {
  const client = clientOf(caller);
  if (client.role !== 'owner' && profileIdOf(caller) !== profileId) {
    throw new ApiError('forbidden', 'Members can change only the profile their app uses.');
  }
}

const profileRoutes = (context: ServerContext) =>
  ({
    createProfile: bound(E.createProfile, ({ body }) =>
      context.store.host.call('profiles', 'create', body),
    ),
    updateProfile: bound(E.updateProfile, async ({ params, body, caller }) => {
      mayChange(caller, params.profileId);
      if (body.scale_user !== undefined && clientOf(caller).role !== 'owner') {
        throw new ApiError('forbidden', 'Only an owner can link a person to a scale slot.');
      }
      const updated = await context.store.host.call('profiles', 'update', params.profileId, body);
      if (body.sex !== undefined || body.birth_date !== undefined || body.height_cm !== undefined) {
        await context.hub.readings.recomputeFor(params.profileId);
      }
      return updated;
    }),
    deleteProfile: bound(E.deleteProfile, async ({ params }) => {
      await context.store.host.call('profiles', 'assertRemovable', params.profileId);
      await removeProfileChats(context.store, context.assistant, params.profileId);
      const { removed, moved } = await context.store.host.write('personRemove', {
        profileId: params.profileId,
      });
      context.access.lifecycle.withdrawn(removed);
      for (const { clientId, profileId } of moved) context.live.profileChanged(clientId, profileId);
      return DONE_REPLY;
    }),
    selectProfile: bound(E.selectProfile, async ({ body, caller }) => {
      const { host } = context.store;
      const profile = await host.call('profiles', 'byId', body.profileId);
      const before = clientOf(caller);
      await assertMayChoosePerson(context.store, before.id, profile.id);
      const stored = await host.call('clients', 'useProfile', before.id, profile.id);
      const client = await host.read('effectiveRow', { client: stored });
      context.live.profileChanged(client.id, profile.id);
      context.talk.accessChanged();
      if (client.role !== before.role) context.live.reconnectClient(client.id);
      return { client, hub: context.status() };
    }),
  }) as const;

const deviceRoutes = ({ store, hub }: ServerContext) =>
  ({
    assignBodyReading: bound(E.assignBodyReading, ({ params, body }) =>
      hub.readings.assign(params.readingId, body.profileId),
    ),
    addLocalDevice: bound(E.addLocalDevice, ({ body }) => hub.local.add(body)),
    removeLocalDevice: bound(E.removeLocalDevice, async ({ params }) => {
      await hub.local.remove(await store.host.call('devices', 'byId', params.deviceId));
      return DONE_REPLY;
    }),
    removeBleObserver: bound(E.removeBleObserver, async ({ params }) => {
      const device = await store.host.call('devices', 'byId', params.deviceId);
      if (device.provider !== 'xiaomi' || !(await hub.local.readiness(device.id)).configured) {
        throw new ApiError(
          'invalid_request',
          'This device has no passive Xiaomi Bluetooth observation to disable.',
        );
      }
      await hub.local.remove(device);
      return DONE_REPLY;
    }),
    readBleDevice: bound(E.readBleDevice, async ({ params }) =>
      hub.local.readiness((await store.host.call('devices', 'byId', params.deviceId)).id),
    ),
    readBleWatch: bound(E.readBleWatch, ({ caller }) => hub.local.watch(clientOf(caller).id)),
    relayBleAdverts: bound(E.relayBleAdverts, ({ body, caller }) =>
      hub.local.relay(body.adverts, clientOf(caller).id),
    ),
  }) as const;

const outboxRoutes = ({ store }: ServerContext) =>
  ({
    readHealthOutbox: bound(E.readHealthOutbox, ({ caller }) =>
      store.host.read('healthOutbox', {
        profileId: profileIdOf(caller),
        sourceId: clientOf(caller).id,
      }),
    ),
    ackHealthOutbox: bound(E.ackHealthOutbox, async ({ body, caller }) => {
      await store.host.write('ackHealthOutbox', {
        phone: { sourceId: clientOf(caller).id, profileId: profileIdOf(caller) },
        ack: body,
      });
      return DONE_REPLY;
    }),
  }) as const;

export const peopleRoutes = (context: ServerContext) =>
  ({
    ...profileRoutes(context),
    ...deviceRoutes(context),
    ...outboxRoutes(context),
  }) as const;
