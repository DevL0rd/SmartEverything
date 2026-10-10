import type { HubTool } from './hub-tool';

type Args = Readonly<Record<string, unknown>>;

interface Change {
  readonly capability: string;
  readonly value: unknown;
  readonly devices: string;
}

const SWITCHES: Readonly<Record<string, readonly [string, string]>> = {
  power: ['Turned on', 'Turned off'],
  mute: ['Muted', 'Unmuted'],
  lock: ['Locked', 'Unlocked'],
  child_lock: ['Turned on the child lock of', 'Turned off the child lock of'],
  privacy: ['Turned on privacy for', 'Turned off privacy for'],
  night_vision: ['Turned on night vision for', 'Turned off night vision for'],
  motion_detection: ['Turned on motion detection for', 'Turned off motion detection for'],
  oscillation: ['Started oscillating', 'Stopped oscillating'],
};

function words(key: string): string {
  return key.replace(/_/g, ' ');
}

function valueWords(value: unknown): string {
  if (typeof value === 'number' || typeof value === 'string') {
    return String(value).replace(/_/g, ' ');
  }
  return 'a new value';
}

function sentenceOf(change: Change): string {
  const switched = SWITCHES[change.capability];
  if (switched !== undefined && typeof change.value === 'boolean') {
    return `${change.value ? switched[0] : switched[1]} ${change.devices}`;
  }
  return `Set the ${words(change.capability)} of ${change.devices} to ${valueWords(change.value)}`;
}

function changeOf(args: Args, devices: string): Change | null {
  if (typeof args['capability'] === 'string') {
    return { capability: args['capability'], value: args['value'], devices };
  }
  return null;
}

function firstChange(args: Args): Args | null {
  const changes = args['changes'];
  if (!Array.isArray(changes) || changes.length === 0) {
    return null;
  }
  const first: unknown = changes[0];
  return typeof first === 'object' && first !== null && !Array.isArray(first)
    ? Object.fromEntries(Object.entries(first))
    : null;
}

export function actionPhrase(tool: HubTool, args: Args, devices: string | null): string | null {
  if (tool.annotations.readOnlyHint) {
    return `Looked up ${tool.title.toLowerCase().replace(/^(get|list|read) /, '')}`;
  }
  if (devices === null) {
    return null;
  }
  const change = changeOf(firstChange(args) ?? args, devices);
  return change === null ? null : sentenceOf(change);
}
