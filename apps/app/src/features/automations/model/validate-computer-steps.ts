import type { AudioChange } from '@smarteverything/domain';
import type { AudioStep, DisplayChange, DisplayStep } from './computer-steps';
import type { DeviceLike } from './capability-choices';

interface Choices {
  readonly devices: readonly DeviceLike[];
}

const GONE_COMPUTER = 'uses a computer that is no longer here';

function empty(text: string): boolean {
  return text.trim() === '';
}

function inRange(value: number, low: number, high: number): boolean {
  return value >= low && value <= high;
}

function computerProblem(choices: Choices, computerId: string): string | null {
  const device = choices.devices.find((candidate) => candidate.id === computerId);
  if (device === undefined) return GONE_COMPUTER;
  return device.kind === 'computer' ? null : `${device.label} is not a computer`;
}

const APP_PROMPT = 'Name the app.';

function required(text: string, message: string): string | null {
  return empty(text) ? message : null;
}

function levelProblem(level: number): string | null {
  return inRange(level, 0, 150) ? null : 'Volume is between 0 and 150 percent.';
}

function audioProblem(change: AudioChange): string | null {
  switch (change.action) {
    case 'volume':
      return levelProblem(change.level);
    case 'mute':
      return null;
    case 'default':
      return required(change.device, 'Name the device to make the default.');
    case 'app_volume':
      return required(change.app, APP_PROMPT) ?? levelProblem(change.level);
    case 'app_mute':
      return required(change.app, APP_PROMPT);
    case 'app_output':
      return (
        required(change.app, APP_PROMPT) ??
        required(change.output, 'Name the output the app should use.')
      );
  }
}

function modeProblem(change: Extract<DisplayChange, { action: 'mode' }>): string | null {
  if (empty(change.output)) return 'Pick the screen.';
  const whole = Number.isInteger(change.width) && Number.isInteger(change.height);
  return whole && change.width > 0 && change.height > 0
    ? null
    : 'Width and height are whole numbers above zero.';
}

function positionProblem(change: Extract<DisplayChange, { action: 'position' }>): string | null {
  if (empty(change.output) || empty(change.relativeTo)) return 'Pick both screens.';
  return change.output === change.relativeTo ? 'Pick two different screens.' : null;
}

function nightLightProblem(
  change: Extract<DisplayChange, { action: 'night_light' }>,
): string | null {
  const { temperatureKelvin } = change;
  if (temperatureKelvin === undefined) return null;
  return Number.isInteger(temperatureKelvin) && inRange(temperatureKelvin, 1000, 6500)
    ? null
    : 'Night light warmth is a whole number between 1000 and 6500 K.';
}

function displayProblem(change: DisplayChange): string | null {
  switch (change.action) {
    case 'mode':
      return modeProblem(change);
    case 'scale':
      if (empty(change.output)) return 'Pick the screen.';
      return inRange(change.percent, 50, 400) ? null : 'Scale is between 50 and 400 percent.';
    case 'position':
      return positionProblem(change);
    case 'brightness':
      return inRange(change.level, 0, 100) ? null : 'Brightness is between 0 and 100 percent.';
    case 'night_light':
      return nightLightProblem(change);
  }
}

export function computerProblems(
  choices: Choices,
  step: AudioStep | DisplayStep,
): readonly string[] {
  const change = step.do === 'audio' ? audioProblem(step.change) : displayProblem(step.change);
  return [computerProblem(choices, step.computer), change].filter((problem) => problem !== null);
}
