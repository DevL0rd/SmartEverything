import { storeUnit } from '../../store/host/unit';

export const WORLD_MIRROR_UNIT = storeUnit((store, _input: null) => ({
  rooms: store.rooms.list(),
  groups: store.deviceGroups.list(),
  effects: store.deviceEffects.list(),
  values: store.automationValues.list(),
  profiles: store.profiles.list(),
  weather: store.weather.read(),
  phones: store.phoneContexts.list(),
  vacuumLinks: store.vacuumRoomLinks.all(),
  streams: store.pluginData.everyStream(),
  enabledPlugins: store.plugins
    .list()
    .filter((plugin) => plugin.enabled)
    .map((plugin) => plugin.id),
}));
