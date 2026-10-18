const CHANNELS = (percent: number): Record<string, { value_percent: string }> => ({
  'front-left': { value_percent: `${String(percent)}%` },
  'front-right': { value_percent: `${String(percent)}%` },
});

function sink(
  index: number,
  name: string,
  description: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    index,
    name,
    description,
    mute: false,
    volume: CHANNELS(40),
    monitor_of_sink: null,
    ports: [],
    properties: {},
    ...extra,
  };
}

export function stream(
  index: number,
  target: number,
  properties: Record<string, string>,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    index,
    mute: false,
    volume: CHANNELS(70),
    properties,
    sink: target,
    source: target,
    ...extra,
  };
}

export const INFO = JSON.stringify({
  default_sink_name: 'speakers',
  default_source_name: 'mic',
});

export const SINKS = JSON.stringify([
  sink(1, 'speakers', 'Built-in Speakers', {
    ports: [{ name: 'analog-output-speaker', availability: 'availability unknown' }],
    active_port: 'analog-output-speaker',
    properties: { 'device.form_factor': 'speaker' },
  }),
  sink(2, 'headset', 'Arctis Nova 7', {
    mute: true,
    volume: CHANNELS(25),
    properties: { 'device.bus': 'usb', 'device.form_factor': 'headset' },
  }),
  sink(3, 'hdmi', 'LG TV', {
    ports: [{ name: 'hdmi-output-0', availability: 'not available' }],
    active_port: 'hdmi-output-0',
  }),
]);

export const SOURCES = JSON.stringify([
  sink(10, 'mic', 'Headset Microphone', { properties: { 'device.form_factor': 'microphone' } }),
  sink(11, 'speakers.monitor', 'Monitor of Speakers', { monitor_of_sink: 'speakers' }),
]);

export const SINK_INPUTS = JSON.stringify([
  stream(100, 1, { 'application.name': 'Spotify', 'application.icon_name': 'spotify' }),
  stream(101, 1, { 'application.name': 'Spotify' }, { volume: CHANNELS(90) }),
  stream(102, 2, { 'application.process.binary': 'firefox' }, { mute: true }),
  stream(103, 4_294_967_295, { 'media.name': 'RVC Bypass Output output' }),
]);

export const SOURCE_OUTPUTS = JSON.stringify([
  stream(200, 10, { 'application.name': 'Discord' }),
  stream(201, 10, { 'application.name': 'Mixer', 'media.name': 'Peak detect' }),
]);

export const PACTL_ANSWERS = {
  'pactl -f json info': INFO,
  'pactl -f json list sinks': SINKS,
  'pactl -f json list sources': SOURCES,
  'pactl -f json list sink-inputs': SINK_INPUTS,
  'pactl -f json list source-outputs': SOURCE_OUTPUTS,
};
