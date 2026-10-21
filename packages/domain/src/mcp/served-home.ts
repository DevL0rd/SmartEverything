import type { Served } from './served-types';

export const SERVED_HOME = [
  {
    name: 'home_read',
    area: 'home',
    access: 'read',
    title: 'See the home',
    line: 'Rooms, devices, people, groups and providers',
    description:
      'The whole home in one read: name, time zone and location, rooms in order with their devices, people with the personId other tools take, device groups and room light sets with their targets and live state, and device providers with their status. Read it first when you need ids. Not for one device in full (device_read) or a filtered device list (device_find).',
    route: {
      compose: ['list_homes', 'list_rooms', 'person_read', 'list_device_groups', 'list_providers'],
    },
  },
  {
    name: 'room_edit',
    area: 'home',
    access: 'control',
    title: 'Edit rooms',
    line: 'Add, rename, reorder or remove',
    description:
      'Adds, renames, reorders or removes a room; roomId comes from home_read. Removing a room leaves its devices unplaced. Not for moving a device into a room (device_edit).',
    route: {
      key: 'action',
      branches: {
        create: { part: 'create_room', line: 'Add a room with a name and optional position' },
        update: { part: 'update_room', line: 'Rename or move one room' },
        remove: { part: 'remove_room', line: 'Remove one room; its devices become unplaced' },
      },
    },
  },
  {
    name: 'group_edit',
    area: 'devices',
    access: 'control',
    title: 'Edit a device group',
    line: 'Create, rename, change members or remove',
    description:
      'Creates, renames, changes the members of or removes a named device group; groupId comes from home_read. Removing a group keeps every device. Not for controlling a group (device_control with group).',
    route: {
      key: 'action',
      branches: {
        create: { part: 'create_device_group', line: 'Create a group from a name and deviceIds' },
        update: { part: 'update_device_group', line: 'Rename a group or replace its members' },
        remove: { part: 'remove_device_group', line: 'Remove a group; its devices stay' },
      },
    },
  },
  {
    name: 'provider_sync',
    area: 'home',
    access: 'control',
    title: 'Sync a provider',
    line: 'Fetch its devices again',
    description:
      'Asks one device provider (Xiaomi, Tuya, SmartThings, Samsung TV), or all of them, to fetch its device list again, for a device that is missing or out of date. Returns what each provider found.',
    route: { part: 'provider_sync' },
  },
  {
    name: 'place_search',
    area: 'home',
    access: 'read',
    title: 'Find a place',
    line: 'Towns and cities by name',
    description:
      'Finds towns and cities by name, with region, country, coordinates and time zone, for setting the home location or asking about weather elsewhere. Returns the best matches first.',
    route: { part: 'place_search' },
  },
  {
    name: 'weather_read',
    area: 'home',
    access: 'read',
    title: 'Weather',
    line: 'Now and the forecast',
    description:
      'Weather at the home: conditions now with air quality and sun times, or the hourly and daily forecast. Use it for any weather question about the home.',
    route: {
      key: 'view',
      default: 'now',
      branches: {
        now: { part: 'weather_read', line: 'Conditions, air quality, sun times and today’s range' },
        forecast: { part: 'get_forecast', line: 'Hourly up to 48 hours and daily up to 10 days' },
      },
    },
  },
  {
    name: 'home_search',
    area: 'devices',
    access: 'read',
    title: 'Search the home',
    line: 'Devices, rooms, people and more by words',
    description:
      'Searches devices, rooms, scenes, automations, remotes, people, capabilities, preferences and health types by words, when you do not know which kind of thing the person means. Returns each match with its kind and id. Not for tools (tool_search).',
    route: { part: 'home_search' },
  },
  {
    name: 'device_find',
    area: 'devices',
    access: 'read',
    title: 'Find devices',
    line: 'By room, family, kind, capability or words',
    description:
      'Lists devices by rooms, families, kinds, capability or words (every word must appear in a name, model, kind, family or room), with id, name, room, provider, online state and capability keys; detail returns each device in full when at most 5 match. An empty result lists the families in the home. Its deviceIds are what every device tool takes.',
    route: { part: 'list_devices' },
  },
  {
    name: 'device_read',
    area: 'devices',
    access: 'read',
    title: 'Read a device',
    line: 'Every capability and its value',
    description:
      'One device in full: every capability with key, label, allowed values, unit, danger level and current value, plus what its kind adds (a remote’s assumed state, a television’s direct link and inputs, a treadmill, toothbrush or bottle link; a toothbrush’s history is operation_call readToothbrush). Read it before device_control or an automation action for the exact capability keys and values.',
    route: { part: 'device_read' },
  },
  {
    name: 'device_edit',
    area: 'devices',
    access: 'control',
    title: 'Edit a device',
    line: 'Name, room, order, inputs, camera recording',
    description:
      'Changes how a device is shown (name, room, hidden, favourite, order, a television’s input names and Wake-on-LAN address) or a camera’s event recording and how many days its clips and pictures are kept. Not for its capabilities (device_control) or what a device hears (listening_edit).',
    route: {
      key: 'action',
      default: 'update',
      branches: {
        update: {
          part: 'update_device',
          line: 'Name, room, hidden, favourite, order, television inputs and wake address',
        },
        camera: {
          part: 'update_camera',
          line: 'Whether a camera records events and keep_days for its clips and pictures',
        },
      },
    },
  },
  {
    name: 'device_control',
    area: 'control',
    access: 'control',
    title: 'Control devices',
    line: 'Any capability on any devices',
    description:
      'Sets one capability (power when left out) to one value on devices chosen by name or id, by group, by rooms and families such as every light in the bedroom, or by words; turning a light on is deviceIds and value true. Value formats and capability keys come from device_read; value null runs an action; scale percent takes 0 to 100; scope on skips devices that are off. Returns each result, the new value and a headline when some did not change. Not for infrared remotes (remote_press).',
    route: { part: 'device_control' },
  },
  {
    name: 'remote_find',
    area: 'devices',
    access: 'read',
    title: 'Find remotes',
    line: 'Infrared remotes and their buttons',
    description:
      'Lists infrared remotes with their blaster, room, button names and what each is assumed to be doing (on, temperature, mode, speed, mute, last key); the state is what was sent, never a reading, and operation_call updateIrRemote corrects it. Read it before remote_press.',
    route: { part: 'remote_find' },
  },
  {
    name: 'remote_press',
    area: 'control',
    access: 'control',
    title: 'Press a remote button',
    line: 'One learned button through its blaster',
    description:
      'Sends one learned button of an infrared remote through its blaster; remote and button names come from remote_find. The press is not confirmed by the device, so the remote’s state is assumed.',
    route: { part: 'remote_press' },
  },
  {
    name: 'scene_run',
    area: 'control',
    access: 'control',
    title: 'Run a scene',
    line: 'Every command in it',
    description:
      'Runs every command of a scene and waits for the results; sceneId comes from scene_find. Returns each command’s outcome. Not for changing a scene (scene_edit).',
    route: { part: 'scene_run' },
  },
  {
    name: 'phone_read',
    area: 'devices',
    access: 'read',
    title: 'Read a phone',
    line: 'What they are doing, battery, sound, apps',
    description:
      'What a person is doing according to their phone (view context: still, walking, driving, at home), or one phone’s battery, sound and now playing, screen, signal, radios, data use, storage, apps, notifications and next alarm (view detail with deviceId from device_find). What belongs to a phone’s own person is left out for anyone else.',
    route: {
      key: 'view',
      default: 'context',
      branches: {
        context: {
          part: 'read_phone_context',
          line: 'What the person is doing and, for themselves, where',
        },
        detail: { part: 'read_phone_detail', line: 'One phone’s state; sections picks the parts' },
      },
    },
  },
  {
    name: 'phone_control',
    area: 'devices',
    access: 'control',
    title: 'Use a phone',
    line: 'Ring, flashlight, volume, screen, media, files',
    description:
      'Does something on a paired phone: ring it at full volume even on silent (find my phone), the flashlight, volumes, ringer and Do Not Disturb, screen brightness and timeout, auto-rotate and touch feedback, open a Settings page, control what plays, dismiss a notification or save a chat attachment on it. Not for locking it, opening an app or link (device_control) or a picture of its screen (sight_look).',
    route: { part: 'phone_control' },
  },
  {
    name: 'watch_read',
    area: 'devices',
    access: 'read',
    title: 'Read a watch',
    line: 'Settings, alarms, faces and workouts',
    description:
      'A watch’s settings, alarms, faces and goals (view config), or its current or last workout with the sports it offers (view workout); deviceId comes from device_find.',
    route: {
      key: 'view',
      default: 'config',
      branches: {
        config: { part: 'read_watch_config', line: 'Settings, alarms, faces and goals' },
        workout: {
          part: 'read_watch_workout',
          line: 'The current or last workout and the sports offered',
        },
      },
    },
  },
  {
    name: 'watch_control',
    area: 'devices',
    access: 'control',
    title: 'Use a watch',
    line: 'Find, sync, settings and workouts',
    description:
      'Does something on a watch through its phone: find it, sync, change a setting, or start, pause, resume or finish a workout in one of the sports watch_read lists.',
    route: { part: 'watch_control' },
  },
] as const satisfies readonly Served[];
