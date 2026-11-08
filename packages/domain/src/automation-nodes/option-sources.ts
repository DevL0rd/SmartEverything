export const OPTION_SOURCE_YIELDS = [
  'device',
  'room',
  'group',
  'person',
  'scene',
  'automation',
  'chat',
  'value',
  'variable',
  'plugin_entity',
  'choice',
] as const;
export type OptionSourceYield = (typeof OPTION_SOURCE_YIELDS)[number];

export const OPTION_SOURCES = [
  { id: 'device.controls', meaning: 'Controls of the picked target.', yields: 'choice' },
  { id: 'device.writable_controls', meaning: 'Controls that can be set.', yields: 'choice' },
  { id: 'device.actions', meaning: 'Action controls that can be pressed.', yields: 'choice' },
  { id: 'device.enum_values', meaning: 'Values a choice control accepts.', yields: 'choice' },
  { id: 'device.families', meaning: 'Device families.', yields: 'choice' },
  { id: 'device.roles', meaning: 'Control roles.', yields: 'choice' },
  { id: 'device.labels', meaning: 'Labels given to devices.', yields: 'choice' },
  { id: 'device.operations', meaning: 'Operations of the device API.', yields: 'choice' },
  { id: 'ir.remotes', meaning: 'Infrared remotes.', yields: 'choice' },
  { id: 'ir.buttons', meaning: 'Buttons of the picked remote.', yields: 'choice' },
  { id: 'ir.appliances', meaning: 'Infrared appliances.', yields: 'choice' },
  { id: 'tools', meaning: 'Tools the assistant can call.', yields: 'choice' },
  { id: 'variables', meaning: 'Variables of the run or the automation.', yields: 'variable' },
  { id: 'values', meaning: 'Home Values.', yields: 'value' },
  { id: 'scenes', meaning: 'Scenes.', yields: 'scene' },
  { id: 'automations', meaning: 'Automations.', yields: 'automation' },
  { id: 'chats', meaning: 'Chats.', yields: 'chat' },
  { id: 'people', meaning: 'People of the home.', yields: 'person' },
  { id: 'computers', meaning: 'Computers of the home.', yields: 'device' },
  { id: 'rooms', meaning: 'Rooms.', yields: 'room' },
  { id: 'groups', meaning: 'Device groups.', yields: 'group' },
  { id: 'signal.sources', meaning: 'Sources that emit signals.', yields: 'choice' },
  { id: 'signal.kinds', meaning: 'Kinds of signal a source emits.', yields: 'choice' },
  { id: 'signal.subjects', meaning: 'Subjects of the picked signal kind.', yields: 'choice' },
  { id: 'signal.fields', meaning: 'Fields of the picked signal kind.', yields: 'choice' },
  { id: 'speech.sources', meaning: 'Places speech is heard.', yields: 'choice' },
  { id: 'listening.sources', meaning: 'Places the home listens.', yields: 'choice' },
  { id: 'computer.apps', meaning: 'Apps installed on the picked computer.', yields: 'choice' },
  { id: 'computer.audio_devices', meaning: 'Audio devices of a computer.', yields: 'choice' },
  { id: 'computer.audio_apps', meaning: 'Apps playing sound on a computer.', yields: 'choice' },
  { id: 'computer.displays', meaning: 'Displays of a computer.', yields: 'choice' },
  { id: 'computer.networks', meaning: 'Networks of a computer.', yields: 'choice' },
  {
    id: 'computer.bluetooth_devices',
    meaning: 'Bluetooth devices of a computer.',
    yields: 'choice',
  },
  {
    id: 'computer.keyboard_layouts',
    meaning: 'Keyboard layouts of a computer.',
    yields: 'choice',
  },
  { id: 'computer.startup_apps', meaning: 'Startup apps of a computer.', yields: 'choice' },
  { id: 'computer.services', meaning: 'Services of a computer.', yields: 'choice' },
  { id: 'computer.processes', meaning: 'Processes of a computer.', yields: 'choice' },
  { id: 'phone.apps', meaning: 'Apps installed on the picked phone.', yields: 'choice' },
  { id: 'phone.contexts', meaning: 'Contexts a phone reports.', yields: 'choice' },
  { id: 'phone.sounds', meaning: 'Sounds a phone can play for a message.', yields: 'choice' },
  { id: 'app.pages', meaning: 'Pages of the app a message can open.', yields: 'choice' },
  { id: 'voices', meaning: 'Voices that can speak a sentence.', yields: 'choice' },
  { id: 'talk.channels', meaning: 'Talk channels a sentence can be spoken on.', yields: 'choice' },
  { id: 'models.chat', meaning: 'Models that answer in chat.', yields: 'choice' },
  { id: 'models.image', meaning: 'Models that make pictures.', yields: 'choice' },
  { id: 'health.metrics', meaning: 'Health metrics.', yields: 'choice' },
  { id: 'weather.conditions', meaning: 'Weather condition kinds.', yields: 'choice' },
  { id: 'triggers.this', meaning: 'Triggers of this automation.', yields: 'choice' },
  { id: 'timers.this', meaning: 'Timers of this automation.', yields: 'choice' },
  { id: 'events.emitted', meaning: 'Event names sent by automations.', yields: 'choice' },
  { id: 'record.fields', meaning: 'Fields of the wired record type.', yields: 'choice' },
  { id: 'camera.presets', meaning: 'Presets of a camera.', yields: 'choice' },
  {
    id: 'camera.night_vision',
    meaning: 'Night vision settings of the picked cameras.',
    yields: 'choice',
  },
  { id: 'tv.inputs', meaning: 'Inputs of a TV.', yields: 'choice' },
  { id: 'tv.apps', meaning: 'Apps of a TV.', yields: 'choice' },
  { id: 'tv.keys', meaning: 'Remote keys of a TV.', yields: 'choice' },
  { id: 'tv.picture_modes', meaning: 'Picture modes of a TV.', yields: 'choice' },
  { id: 'tv.sound_modes', meaning: 'Sound modes of a TV.', yields: 'choice' },
  { id: 'light.effects', meaning: 'Effects of the picked light.', yields: 'choice' },
  { id: 'climate.modes', meaning: 'Modes of the picked climate devices.', yields: 'choice' },
  {
    id: 'climate.fan_modes',
    meaning: 'Fan settings of the picked climate devices.',
    yields: 'choice',
  },
  {
    id: 'climate.swing_modes',
    meaning: 'Swing settings of the picked climate devices.',
    yields: 'choice',
  },
  { id: 'vacuum.rooms', meaning: 'Rooms a vacuum can clean.', yields: 'choice' },
  { id: 'laundry.programs', meaning: 'Programs of a washer or dryer.', yields: 'choice' },
  { id: 'event.kinds', meaning: 'Kinds of event a source reports.', yields: 'choice' },
  { id: 'time_zones', meaning: 'Time zones.', yields: 'choice' },
  { id: 'locales', meaning: 'Locales.', yields: 'choice' },
  { id: 'plugin.entity', meaning: 'Entities a plugin lists.', yields: 'plugin_entity' },
] as const;

export type OptionSourceId = (typeof OPTION_SOURCES)[number]['id'];

export const OPTION_SOURCE_IDS: readonly OptionSourceId[] = OPTION_SOURCES.map(
  (source) => source.id,
);

export const PORT_EDITORS = [
  'control-value',
  'condition',
  'week-grid',
  'date-list',
  'key-value-rows',
  'field-rows',
  'lookup-table',
  'state-list',
  'colour',
  'kelvin',
  'duration',
  'time-of-day',
  'key-combo',
  'http-auth',
  'phone-action',
] as const;

export type PortEditorId = (typeof PORT_EDITORS)[number];

export function isOptionSourceId(id: string): id is OptionSourceId {
  return OPTION_SOURCE_IDS.some((known) => known === id);
}

export function isPortEditorId(id: string): id is PortEditorId {
  return PORT_EDITORS.some((known) => known === id);
}

export function optionSourceOf(id: OptionSourceId): (typeof OPTION_SOURCES)[number] {
  const found = OPTION_SOURCES.find((source) => source.id === id);
  if (found === undefined) throw new Error(`unknown option source "${id}"`);
  return found;
}
