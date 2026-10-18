import { removeProfileChats } from '../../assistant/remove-profile-chats';
import { API_ENDPOINTS as E, ApiError } from '@smarteverything/domain';
import { outboxReadingOf } from '../../local/reading-records';
import { clientOf, profileIdOf, type Caller } from '../auth';
import type { ServerContext } from '../context';
import { ackEntries } from './nutrition';
import { DONE_REPLY, bound } from '../router';
import { assertMayChoosePerson, effectiveRow } from '../person-access';

function mayChange(context: ServerContext, caller: Caller, profileId: string): void {
  const client = clientOf(caller);
  if (client.role !== 'owner' && profileIdOf(context.store, caller) !== profileId) {
    throw new ApiError('forbidden', 'Members can change only the profile their app uses.');
  }
}

const profileRoutes = (context: ServerContext) =>
  ({
    createProfile: bound(E.createProfile, ({ body }) => context.store.profiles.create(body)),
    updateProfile: bound(E.updateProfile, ({ params, body, caller }) => {
      mayChange(context, caller, params.profileId);
      if (body.scale_user !== undefined && clientOf(caller).role !== 'owner') {
        throw new ApiError('forbidden', 'Only an owner can link a person to a scale slot.');
      }
      const updated = context.store.profiles.update(params.profileId, body);
      if (body.sex !== undefined || body.birth_date !== undefined || body.height_cm !== undefined) {
        context.hub.readings.recomputeFor(params.profileId);
      }
      return updated;
    }),
    deleteProfile: bound(E.deleteProfile, async ({ params }) => {
      context.store.profiles.assertRemovable(params.profileId);
      await removeProfileChats(context.store, context.assistant, params.profileId);
      const onProfile = context.store.clients
        .list()
        .filter((client) => client.profile_id === params.profileId);
      const members = onProfile.filter((client) => client.role === 'member');
      const moved = onProfile.filter((client) => client.role === 'owner');
      context.store.write(() => {
        context.access.lifecycle.unpair(members, params.profileId, 'the person was removed');
        context.store.profiles.remove(params.profileId);
      });
      for (const client of moved) {
        context.live.profileChanged(client.id, context.store.profiles.activeOf(client.id).id);
      }
      return DONE_REPLY;
    }),
    selectProfile: bound(E.selectProfile, ({ body, caller }) => {
      const profile = context.store.profiles.byId(body.profileId);
      const before = clientOf(caller);
      assertMayChoosePerson(context.store, before.id, profile.id);
      const stored = context.store.clients.useProfile(before.id, profile.id);
      const client = effectiveRow(context.store, stored);
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
      await hub.local.remove(store.devices.byId(params.deviceId));
      return DONE_REPLY;
    }),
    removeBleObserver: bound(E.removeBleObserver, async ({ params }) => {
      const device = store.devices.byId(params.deviceId);
      if (device.provider !== 'xiaomi' || !hub.local.readiness(device.id).configured) {
        throw new ApiError(
          'invalid_request',
          'This device has no passive Xiaomi Bluetooth observation to disable.',
        );
      }
      await hub.local.remove(device);
      return DONE_REPLY;
    }),
    readBleDevice: bound(E.readBleDevice, ({ params }) =>
      hub.local.readiness(store.devices.byId(params.deviceId).id),
    ),
    readBleWatch: bound(E.readBleWatch, ({ caller }) => hub.local.watch(clientOf(caller).id)),
    relayBleAdverts: bound(E.relayBleAdverts, ({ body, caller }) =>
      hub.local.relay(body.adverts, clientOf(caller).id),
    ),
  }) as const;

const outboxRoutes = ({ store }: ServerContext) =>
  ({
    readHealthOutbox: bound(E.readHealthOutbox, ({ caller }) => {
      const profileId = profileIdOf(store, caller);
      const sourceId = clientOf(caller).id;
      return {
        readings: store.bodyReadings
          .outbox(profileId, sourceId)
          .flatMap(
            (reading) => outboxReadingOf(reading, store.profiles.byId(profileId).height_cm) ?? [],
          ),
        entries: store.healthEntries.outbox(profileId, sourceId),
      };
    }),
    ackHealthOutbox: bound(E.ackHealthOutbox, ({ body, caller }) => {
      const sourceId = clientOf(caller).id;
      const profileId = profileIdOf(store, caller);
      store.write(() => {
        for (const written of body.written) {
          const reading = store.bodyReadings.byId(written.id);
          if (reading.profile_id !== profileId || written.version > reading.version) {
            throw new ApiError('conflict', `Reading ${written.id} is not this phone’s to save.`);
          }
          store.bodyReadings.written(sourceId, written.id, written.version);
        }
        ackEntries(store, { sourceId, profileId }, body);
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
