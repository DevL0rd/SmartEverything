import { isStandardCapability } from './capabilities';
import type { DeviceCapability } from './devices';
import { detailOf, keywordsOf } from './search';
import type {
  SearchDevice,
  SearchEntry,
  SearchIrButton,
  SearchIrRemote,
  SearchSources,
  SearchTarget,
} from './search';

const HISTORY_WORDS: readonly string[] = ['history', 'chart', 'graph', 'trend', 'show'];

const LEARN_WORDS: readonly string[] = ['ir', 'infrared', 'remote', 'learn', 'teach', 'new'];

export const LEARN_FOCUS = 'learn';

export function historyFocus(capability: string): string {
  return `history:${capability}`;
}

export function learnRemoteFocus(remoteId: string): string {
  return `${LEARN_FOCUS}:${remoteId}`;
}

export type DevicePageFocus =
  | { readonly kind: 'none' }
  | { readonly kind: 'history'; readonly capability: string }
  | { readonly kind: 'learn'; readonly remoteId: string | null };

export function focusOf(focus: string | null): DevicePageFocus {
  if (focus === null) {
    return { kind: 'none' };
  }
  if (focus === LEARN_FOCUS) {
    return { kind: 'learn', remoteId: null };
  }
  const [area, ...rest] = focus.split(':');
  const target = rest.join(':');
  if (area === 'history' && target !== '') {
    return { kind: 'history', capability: target };
  }
  if (area === LEARN_FOCUS && target !== '') {
    return { kind: 'learn', remoteId: target };
  }
  return { kind: 'none' };
}

function pageOf(deviceId: string, focus: string | null): SearchTarget {
  return { kind: 'device-page', deviceId, focus };
}

interface PageEntry {
  readonly id: string;
  readonly group: SearchEntry['group'];
  readonly title: string;
  readonly detail: string;
  readonly keywords: readonly string[];
  readonly page: SearchTarget;
  readonly runLabel: string | null;
}

function entryOf(entry: PageEntry): SearchEntry {
  return {
    id: entry.id,
    group: entry.group,
    title: entry.title,
    detail: entry.detail,
    keywords: entry.keywords,
    state: null,
    run: entry.runLabel === null ? null : entry.page,
    runLabel: entry.runLabel,
    open: entry.page,
    openLabel: 'Open',
    suggested: false,
  };
}

function historyOf(device: SearchDevice, charted: readonly DeviceCapability[]): SearchEntry[] {
  const [first] = charted;
  if (first === undefined) {
    return [];
  }
  return [
    entryOf({
      id: `history:${device.id}`,
      group: 'page',
      title: `History — ${device.name}`,
      detail: detailOf(device),
      keywords: [
        ...HISTORY_WORDS,
        ...charted.flatMap((capability) => keywordsOf(device, capability)),
      ],
      page: pageOf(device.id, historyFocus(first.key)),
      runLabel: 'Show',
    }),
  ];
}

function learnOnBlaster(device: SearchDevice): SearchEntry {
  return entryOf({
    id: `learn:${device.id}`,
    group: 'action',
    title: `Learn a new remote button — ${device.name}`,
    detail: detailOf(device),
    keywords: [...LEARN_WORDS, 'button', 'tv', 'air conditioner', device.room ?? ''].filter(
      (word) => word !== '',
    ),
    page: pageOf(device.id, LEARN_FOCUS),
    runLabel: 'Learn',
  });
}

function canLearn(device: SearchDevice): boolean {
  return device.capabilities.some(
    (capability) => capability.key === 'ir_learn' && capability.access !== 'read',
  );
}

function deviceEntries(device: SearchDevice): SearchEntry[] {
  const charted = device.capabilities.filter(
    (capability) => capability.value.kind === 'number' && isStandardCapability(capability.key),
  );
  return [...historyOf(device, charted), ...(canLearn(device) ? [learnOnBlaster(device)] : [])];
}

function remoteWords(remote: SearchIrRemote): string[] {
  return [remote.name, remote.category, remote.brand ?? '', ...LEARN_WORDS].filter(
    (word) => word !== '',
  );
}

function remoteDetail(remote: SearchIrRemote): string {
  return remote.brand === null
    ? `${remote.category} remote`
    : `${remote.brand} ${remote.category} remote`;
}

function buttonEntry(remote: SearchIrRemote, button: SearchIrButton): SearchEntry {
  return {
    id: `ir:${remote.id}:${button.button}`,
    group: 'action',
    title: `${button.button} — ${remote.name}`,
    detail: remoteDetail(remote),
    keywords: ['press', 'button', 'send', ...remoteWords(remote)],
    state: null,
    run: {
      kind: 'command',
      deviceId: remote.blasterId,
      capability: 'ir_send',
      value: { format: button.format, code: button.code },
    },
    runLabel: 'Press',
    open: pageOf(remote.pageDeviceId, null),
    openLabel: 'Open',
    suggested: false,
  };
}

function remoteEntries(remote: SearchIrRemote): SearchEntry[] {
  return [
    entryOf({
      id: `learn-remote:${remote.id}`,
      group: 'action',
      title: `Learn a new button — ${remote.name}`,
      detail: remoteDetail(remote),
      keywords: ['button', ...remoteWords(remote)],
      page: pageOf(remote.pageDeviceId, learnRemoteFocus(remote.id)),
      runLabel: 'Learn',
    }),
    ...remote.buttons.map((button) => buttonEntry(remote, button)),
  ];
}

export function devicePageEntries(sources: SearchSources): SearchEntry[] {
  return [...sources.devices.flatMap(deviceEntries), ...sources.irRemotes.flatMap(remoteEntries)];
}
