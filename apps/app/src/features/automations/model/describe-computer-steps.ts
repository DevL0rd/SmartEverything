import type { AudioChange } from '@smarteverything/domain';
import { deviceName, type Names } from './describe-names';
import type { AudioStep, DisplayChange, DisplayStep } from './computer-steps';

const SIDE_PHRASES = {
  left: 'to the left of',
  right: 'to the right of',
  above: 'above',
  below: 'below',
} as const;

const NIGHT_LIGHT_PHRASES = {
  on: 'turn night light on',
  off: 'turn night light off',
  scheduled: 'set night light to follow its schedule',
} as const;

function percent(level: number): string {
  return `${String(level)}%`;
}

function named(value: string, fallback: string): string {
  return value.trim() === '' ? fallback : value;
}

type WholeSoundChange = Extract<AudioChange, { action: 'volume' | 'mute' | 'default' }>;

function wholeSoundPhrase(change: WholeSoundChange, computer: string): string {
  const input = change.kind === 'input';
  switch (change.action) {
    case 'volume':
      return `set the ${input ? 'microphone level' : 'volume'} on ${computer} to ${percent(change.level)}`;
    case 'mute':
      return `${change.muted ? 'mute' : 'unmute'} the ${input ? 'microphone' : 'sound'} on ${computer}`;
    case 'default':
      return `make ${named(change.device, 'a device')} the default ${input ? 'microphone' : 'output'} on ${computer}`;
  }
}

function audioPhrase(change: AudioChange, computer: string): string {
  if (change.action === 'volume' || change.action === 'mute' || change.action === 'default')
    return wholeSoundPhrase(change, computer);
  switch (change.action) {
    case 'app_volume':
      return `set ${named(change.app, 'an app')}’s volume on ${computer} to ${percent(change.level)}`;
    case 'app_mute':
      return `${change.muted ? 'mute' : 'unmute'} ${named(change.app, 'an app')} on ${computer}`;
    case 'app_output':
      return `play ${named(change.app, 'an app')} through ${named(change.output, 'an output')} on ${computer}`;
  }
}

function modePhrase(change: Extract<DisplayChange, { action: 'mode' }>, computer: string): string {
  const rate = change.refreshHz === undefined ? '' : ` at ${String(change.refreshHz)} Hz`;
  const size = `${String(change.width)}×${String(change.height)}`;
  return `set ${named(change.output, 'a screen')} on ${computer} to ${size}${rate}`;
}

function nightLightPhrase(
  change: Extract<DisplayChange, { action: 'night_light' }>,
  computer: string,
): string {
  const warmth =
    change.temperatureKelvin === undefined ? '' : ` at ${String(change.temperatureKelvin)} K`;
  return `${NIGHT_LIGHT_PHRASES[change.mode]}${warmth} on ${computer}`;
}

function displayPhrase(change: DisplayChange, computer: string): string {
  switch (change.action) {
    case 'mode':
      return modePhrase(change, computer);
    case 'scale':
      return `set the scale of ${named(change.output, 'a screen')} on ${computer} to ${percent(change.percent)}`;
    case 'position':
      return `place ${named(change.output, 'a screen')} ${SIDE_PHRASES[change.side]} ${named(change.relativeTo, 'another screen')} on ${computer}`;
    case 'brightness':
      return `set the brightness of ${change.output ?? 'every screen'} on ${computer} to ${percent(change.level)}`;
    case 'night_light':
      return nightLightPhrase(change, computer);
  }
}

export function describeAudioStep(names: Names, step: AudioStep): string {
  return audioPhrase(step.change, deviceName(names, step.computer));
}

export function describeDisplayStep(names: Names, step: DisplayStep): string {
  const phrase = displayPhrase(step.change, deviceName(names, step.computer));
  return step.keep === true ? `${phrase}, and keep it` : phrase;
}
