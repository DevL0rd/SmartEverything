import { pickableControls } from './capability-presentation';
import { DEVICE_KIND_LABELS } from './device-kinds';
import { accepts, detailOf, deviceSummary, keywordsOf, numberPresets } from './search';
import { formatValue } from './value-format';
import type {
  NumberTemplate,
  SearchAutomation,
  SearchDevice,
  SearchEntry,
  SearchIndex,
  SearchPage,
  SearchRoom,
  SearchScene,
  SearchSetting,
  SearchSources,
  SearchTarget,
} from './search';
import type { PresentedCapability } from './presentation/types';
import type { JsonValue } from './values';
import { devicePageEntries } from './search-device-pages';
import { cameraEntries } from './search-cameras';

const BOOLEAN_VERBS: Readonly<Record<string, readonly [string, string]>> = {
  power: ['Turn on', 'Turn off'],
  lock: ['Lock', 'Unlock'],
  mute: ['Mute', 'Unmute'],
  privacy_mode: ['Turn on privacy', 'Turn off privacy'],
};

const SETTING_WORDS: readonly string[] = ['set', 'to'];

interface ActionPhrase {
  readonly phrase: string;
  readonly value: JsonValue;
}

function booleanPhrases(key: string, label: string): readonly ActionPhrase[] {
  const verbs = BOOLEAN_VERBS[key] ?? [`${label} on`, `${label} off`];
  return [
    { phrase: verbs[0], value: true },
    { phrase: verbs[1], value: false },
  ];
}

function phrasesOf({ capability, label }: PresentedCapability): readonly ActionPhrase[] {
  const descriptor = capability.value;
  switch (descriptor.kind) {
    case 'boolean':
      return booleanPhrases(capability.key, label);
    case 'enum':
      return descriptor.options.map((option) => ({
        phrase: `${label} → ${option}`,
        value: option,
      }));
    case 'number':
      return numberPresets(descriptor).map((value) => ({
        phrase: `${label} ${formatValue(capability.key, descriptor, value)}`,
        value,
      }));
    case 'action':
      return descriptor.arguments === undefined ? [{ phrase: label, value: null }] : [];
    case 'color':
    case 'text':
      return [];
  }
}

function commandEntry(
  device: SearchDevice,
  presented: PresentedCapability,
  action: ActionPhrase,
): SearchEntry {
  const { capability } = presented;
  return {
    id: `action:${device.id}:${capability.key}:${JSON.stringify(action.value)}`,
    group: 'action',
    title: `${action.phrase} — ${device.name}`,
    detail: detailOf(device),
    keywords: [
      ...keywordsOf(device, capability, presented),
      ...(capability.value.kind === 'enum' || capability.value.kind === 'number'
        ? SETTING_WORDS
        : []),
    ],
    state: null,
    run: { kind: 'command', deviceId: device.id, capability: capability.key, value: action.value },
    runLabel: 'Run',
    open: { kind: 'device', deviceId: device.id },
    openLabel: 'Open',
    suggested: device.favourite && capability.key === 'power',
  };
}

function openOnlyEntry(device: SearchDevice, presented: PresentedCapability): SearchEntry {
  return {
    id: `control:${device.id}:${presented.capability.key}`,
    group: 'action',
    title: `${presented.label} — ${device.name}`,
    detail: detailOf(device),
    keywords: keywordsOf(device, presented.capability, presented),
    state: null,
    run: null,
    runLabel: null,
    open: { kind: 'device', deviceId: device.id },
    openLabel: 'Open',
    suggested: false,
  };
}

function actionEntries(device: SearchDevice): SearchEntry[] {
  const entries: SearchEntry[] = [];
  for (const presented of pickableControls(device)) {
    if (presented.colorEncoding !== undefined) {
      entries.push(openOnlyEntry(device, presented));
      continue;
    }
    const phrases = phrasesOf(presented);
    if (phrases.length === 0) {
      entries.push(openOnlyEntry(device, presented));
    }
    for (const phrase of phrases) {
      entries.push(commandEntry(device, presented, phrase));
    }
  }
  return entries;
}

function powerToggle(device: SearchDevice): SearchTarget | null {
  const power = device.capabilities.find((capability) => capability.key === 'power');
  if (power === undefined || power.access === 'read') {
    return null;
  }
  return {
    kind: 'command',
    deviceId: device.id,
    capability: 'power',
    value: device.state['power'] !== true,
  };
}

function deviceEntry(device: SearchDevice): SearchEntry {
  const run = powerToggle(device);
  return {
    id: `device:${device.id}`,
    group: 'device',
    title: device.name,
    detail: [device.room, DEVICE_KIND_LABELS[device.kind]]
      .filter((part) => part !== null)
      .join(' · '),
    keywords: [DEVICE_KIND_LABELS[device.kind], device.room ?? '', 'device'].filter(
      (word) => word !== '',
    ),
    state: deviceSummary(device),
    run,
    runLabel: run === null ? null : device.state['power'] === true ? 'Turn off' : 'Turn on',
    open: { kind: 'device', deviceId: device.id },
    openLabel: 'Open',
    suggested: device.favourite,
  };
}

function roomEntry(room: SearchRoom): SearchEntry {
  return {
    id: `room:${room.id}`,
    group: 'room',
    title: room.name,
    detail: `${String(room.deviceCount)} ${room.deviceCount === 1 ? 'device' : 'devices'}`,
    keywords: ['room'],
    state: null,
    run: null,
    runLabel: null,
    open: { kind: 'room', roomId: room.id },
    openLabel: 'Show',
    suggested: false,
  };
}

function pageEntry(page: SearchPage): SearchEntry {
  return {
    id: `page:${page.path}`,
    group: 'page',
    title: page.title,
    detail: page.description,
    keywords: ['page', 'go', 'open', ...page.keywords],
    state: null,
    run: null,
    runLabel: null,
    open: { kind: 'page', path: page.path },
    openLabel: 'Go',
    suggested: false,
  };
}

function settingEntry(setting: SearchSetting): SearchEntry {
  return {
    id: `setting:${setting.id}`,
    group: 'setting',
    title: setting.title,
    detail: setting.section,
    keywords: ['setting', ...setting.keywords],
    state: setting.state,
    run:
      setting.value === undefined
        ? null
        : { kind: 'setting', settingId: setting.id, value: setting.value },
    runLabel: setting.value === undefined ? null : setting.runLabel,
    open: { kind: 'page', path: setting.path },
    openLabel: 'Open',
    suggested: false,
  };
}

function sceneEntry(scene: SearchScene): SearchEntry {
  return {
    id: `scene:${scene.id}`,
    group: 'scene',
    title: scene.name,
    detail: 'Scene',
    keywords: ['scene', 'mode', 'run', 'activate', 'start'],
    state: null,
    run: { kind: 'scene', sceneId: scene.id },
    runLabel: 'Run',
    open: { kind: 'page', path: scene.path },
    openLabel: 'Edit',
    suggested: false,
  };
}

function automationEntry(automation: SearchAutomation): SearchEntry {
  return {
    id: `automation:${automation.id}`,
    group: 'automation',
    title: automation.name,
    detail: 'Automation',
    keywords: [
      'automation',
      'rule',
      ...(automation.triggerKeywords ?? []),
      ...(automation.enabled
        ? ['disable', 'pause', 'stop', 'turn off']
        : ['enable', 'resume', 'start', 'turn on']),
    ],
    state: automation.enabled ? 'Armed' : 'Paused',
    run: { kind: 'automation', automationId: automation.id, enabled: !automation.enabled },
    runLabel: automation.enabled ? 'Pause' : 'Enable',
    open: { kind: 'page', path: automation.path },
    openLabel: 'Edit',
    suggested: false,
  };
}

function numberTemplates(devices: readonly SearchDevice[]): NumberTemplate[] {
  const templates: NumberTemplate[] = [];
  for (const device of devices) {
    for (const presented of pickableControls(device)) {
      const descriptor = presented.capability.value;
      if (descriptor.kind === 'number' && presented.colorEncoding === undefined) {
        templates.push({ device, presented, descriptor });
      }
    }
  }
  return templates;
}

export function buildSearchIndex(sources: SearchSources): SearchIndex {
  const entries: SearchEntry[] = [
    ...sources.devices.flatMap((device) => [deviceEntry(device), ...actionEntries(device)]),
    ...sources.rooms.map(roomEntry),
    ...sources.pages.map(pageEntry),
    ...sources.settings.map(settingEntry),
    ...sources.scenes.map(sceneEntry),
    ...sources.automations.map(automationEntry),
    ...devicePageEntries(sources),
    ...cameraEntries(sources),
  ];
  return { entries, numbers: numberTemplates(sources.devices) };
}

export function typedNumberEntries(index: SearchIndex, value: number | null): SearchEntry[] {
  return index.numbers
    .filter((template) => accepts(template.descriptor, value))
    .map((template) =>
      commandEntry(template.device, template.presented, {
        phrase: `${template.presented.label} ${formatValue(template.presented.capability.key, template.descriptor, value)}`,
        value,
      }),
    );
}
