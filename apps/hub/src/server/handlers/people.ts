import { removeProfileChats } from '../../assistant/remove-profile-chats';
import { API_ENDPOINTS as E, ApiError } from '@smarteverything/domain';
import { outboxReadingOf } from '../../local/reading-records';
import { clientOf, healthSourceOf, profileIdOf, type Caller } from '../auth';
import type { ServerContext } from '../context';
import { ackEntries } from './nutrition';
import { DONE_REPLY, bound, type Bound } from '../router';

type PeopleRoutes = Record<
  | 'createProfile'
  | 'updateProfile'
  | 'deleteProfile'
  | 'selectProfile'
  | 'assignBodyReading'
  | 'addLocalDevice'
  | 'removeLocalDevice'
  | 'removeBleObserver'
  | 'readBleDevice'
  | 'readBleWatch'
  | 'relayBleAdverts'
  | 'readHealthOutbox'
  | 'ackHealthOutbox',
  Bound
>;

function mayChange(context: ServerContext, caller: Caller, profileId: string): void {
  const client = clientOf(caller);
  if (client.role !== 'owner' && profileIdOf(context.store, caller) !== profileId) {
    throw new ApiError('forbidden', 'Members can change only the profile their app uses.');
  }
}

function profileRoutes(
  context: ServerContext,
): Pick<PeopleRoutes, 'createProfile' | 'updateProfile' | 'deleteProfile' | 'selectProfile'> {
  const { store, live } = context;
  return {
    createProfile: bound(E.createProfile, ({ body }) => store.profiles.create(body)),
    updateProfile: bound(E.updateProfile, ({ params, body, caller }) => {
      mayChange(context, caller, params.profileId);
      const updated = store.profiles.update(params.profileId, body);
      if (body.sex !== undefined || body.birth_date !== undefined || body.height_cm !== undefined) {
        context.hub.readings.recomputeFor(params.profileId);
      }
      return updated;
    }),
    deleteProfile: bound(E.deleteProfile, async ({ params }) => {
      store.profiles.assertRemovable(params.profileId);
      await removeProfileChats(store, context.assistant, params.profileId);
      const moved = store.clients.list().filter((client) => client.profile_id === params.profileId);
      store.profiles.remove(params.profileId);
      for (const client of moved) {
        live.profileChanged(client.id, store.profiles.activeOf(client.id).id);
      }
      return DONE_REPLY;
    }),
    selectProfile: bound(E.selectProfile, ({ body, caller }) => {
      const profile = store.profiles.byId(body.profileId);
      const client = store.clients.useProfile(clientOf(caller).id, profile.id);
      live.profileChanged(client.id, profile.id);
      return { client, hub: context.status() };
    }),
  };
}

function deviceRoutes(
  context: ServerContext,
): Pick<
  PeopleRoutes,
  | 'assignBodyReading'
  | 'addLocalDevice'
  | 'removeLocalDevice'
  | 'removeBleObserver'
  | 'readBleDevice'
  | 'readBleWatch'
  | 'relayBleAdverts'
> {
  const { store, hub } = context;
  return {
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
  };
}

function outboxRoutes(
  context: ServerContext,
): Pick<PeopleRoutes, 'readHealthOutbox' | 'ackHealthOutbox'> {
  const { store } = context;
  return {
    readHealthOutbox: bound(E.readHealthOutbox, ({ caller }) => {
      const profileId = profileIdOf(store, caller);
      const sourceId = healthSourceOf(caller).id;
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
      const source = healthSourceOf(caller);
      const profileId = profileIdOf(store, caller);
      store.write(() => {
        for (const written of body.written) {
          const reading = store.bodyReadings.byId(written.id);
          if (reading.profile_id !== profileId || written.version > reading.version) {
            throw new ApiError('conflict', `Reading ${written.id} is not this phone’s to save.`);
          }
          store.bodyReadings.written(source.id, written.id, written.version);
        }
        ackEntries(store, { sourceId: source.id, profileId }, body);
      });
      return DONE_REPLY;
    }),
  };
}

export function peopleRoutes(context: ServerContext): PeopleRoutes {
  return { ...profileRoutes(context), ...deviceRoutes(context), ...outboxRoutes(context) };
}
