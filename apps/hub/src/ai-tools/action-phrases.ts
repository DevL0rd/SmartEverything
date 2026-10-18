import type { HubTool } from './hub-tool';

type Args = Readonly<Record<string, unknown>>;

interface Change {
  readonly capability: string;
  readonly value: unknown;
  readonly percent: boolean;
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

const READ_VERB = /^(get|list|read|find|search|show|see)\s+/u;

const TARGET_KINDS: Readonly<Record<string, string>> = {
  room: 'the room',
  group: 'the group',
  devices: 'the selected devices',
};

function words(key: string): string {
  return key.replace(/_/g, ' ');
}

function recordOf(value: unknown): Args | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;
}

function texts(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry !== '')
    : [];
}

function valueWords(change: Change): string {
  if (typeof change.value === 'boolean') {
    return change.value ? 'on' : 'off';
  }
  if (typeof change.value === 'number' || typeof change.value === 'string') {
    const text = String(change.value).replace(/_/g, ' ');
    return change.percent ? `${text} percent` : text;
  }
  return 'a new value';
}

function sentenceOf(change: Change): string {
  if (change.value === null) {
    return `Ran ${words(change.capability)} on ${change.devices}`;
  }
  const switched = SWITCHES[change.capability];
  if (switched !== undefined && typeof change.value === 'boolean') {
    return `${change.value ? switched[0] : switched[1]} ${change.devices}`;
  }
  return `Set the ${words(change.capability)} of ${change.devices} to ${valueWords(change)}`;
}

function describedTarget(target: Args | null): string | null {
  if (target === null) {
    return null;
  }
  const kind = target['kind'];
  const rooms = texts(target['rooms']);
  const families = texts(target['families']);
  const search = target['search'];
  if (typeof kind === 'string' && TARGET_KINDS[kind] !== undefined) {
    return TARGET_KINDS[kind];
  }
  if (rooms.length > 0) {
    return `the devices in ${rooms.join(' and ')}`;
  }
  if (families.length > 0) {
    return `the ${words(families.join(' and '))} devices`;
  }
  return typeof search === 'string' ? `the devices matching ${search}` : null;
}

function changeOf(args: Args, devices: string | null): Change | null {
  const capability = args['capability'];
  const place = devices ?? describedTarget(recordOf(args['target']));
  if (typeof capability !== 'string' || place === null) {
    return null;
  }
  return { capability, value: args['value'], percent: args['scale'] === 'percent', devices: place };
}

function changesOf(args: Args): readonly Args[] {
  const changes = args['changes'];
  const listed = Array.isArray(changes)
    ? changes.map(recordOf).filter((change): change is Args => change !== null)
    : [];
  return listed.length > 0 ? listed : [args];
}

function moreChanges(count: number): string {
  return count > 1 ? ` and ${String(count - 1)} more ${count === 2 ? 'change' : 'changes'}` : '';
}

export function actionPhrase(tool: HubTool, args: Args, devices: string | null): string | null {
  if (tool.annotations.readOnlyHint) {
    return `Looked up ${tool.title.toLowerCase().replace(READ_VERB, '')}`;
  }
  const changes = changesOf(args);
  const first = changes[0];
  const change = first === undefined ? null : changeOf(first, devices);
  return change === null ? null : `${sentenceOf(change)}${moreChanges(changes.length)}`;
}
