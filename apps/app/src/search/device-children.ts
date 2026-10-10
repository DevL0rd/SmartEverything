import { presentDevice, tokenScore } from '@smarteverything/domain';
import type { TextRange } from '../components/highlighted';
import { deviceIdOf, type SearchCatalogue } from './catalogue';
import { rangeIn, type EntryHit } from './match';
import { entryItem, entryTitle, titleOf, type NodeItem } from './nodes';
import type { NamedDevice } from './sources';

export interface Draft {
  readonly key: string;
  readonly item: NodeItem;
  readonly own: number | null;
  readonly range: TextRange | null;
  readonly parent: string | null;
}

const QUICK_ACTIONS = 6;

const WORD = /[\s→—·,]+/;

const LOOSE = 1;

function deviceKey(deviceId: string): string {
  return `device:${deviceId}`;
}

function capabilityKey(deviceId: string, capability: string): string {
  return `capability:${deviceId}:${capability}`;
}

function deviceNameOf(id: string, catalogue: SearchCatalogue): string {
  const entry = catalogue.entries.get(id);
  const deviceId = entry === undefined || entry.group === 'device' ? null : deviceIdOf(entry);
  return deviceId === null ? '' : (catalogue.devices.get(deviceId)?.name ?? '');
}

export function entryDraft(
  id: string,
  own: number | null,
  tokens: readonly string[],
  catalogue: SearchCatalogue,
): Draft | null {
  const entry = catalogue.entries.get(id);
  if (entry === undefined) {
    return null;
  }
  const item = entryItem(entry, catalogue);
  return {
    key: id,
    item,
    own,
    range: rangeIn(titleOf(item), tokens, deviceNameOf(id, catalogue)),
    parent: catalogue.parents.get(id) ?? null,
  };
}

function namesValue(phrase: string, label: string, tokens: readonly string[]): boolean {
  const known = new Set(label.toLowerCase().split(WORD));
  const words = phrase
    .toLowerCase()
    .split(WORD)
    .filter((word) => word !== '' && !known.has(word));
  return tokens.some((token) => words.some((word) => word.startsWith(token)));
}

interface CapabilityHits {
  readonly named: NamedDevice;
  readonly capability: string;
  readonly hits: readonly EntryHit[];
}

function phraseDrafts(
  { named, capability, hits }: CapabilityHits,
  tokens: readonly string[],
  catalogue: SearchCatalogue,
): Draft[] {
  const key = capabilityKey(named.device.id, capability);
  const control = catalogue.controls.get(key)?.presented;
  const label = control === undefined ? '' : `${control.label} ${control.capability.label}`;
  const valued = hits.filter((hit) => namesValue(entryTitle(hit.entry, catalogue), label, tokens));
  const best = Math.max(...valued.map((hit) => hit.score));
  const parent = catalogue.parents.get(key) ?? deviceKey(named.device.id);
  return valued
    .filter((hit) => hit.score === best)
    .map((hit) => {
      const phrase = entryTitle(hit.entry, catalogue);
      return {
        key: hit.entry.id,
        item: { kind: 'phrase', deviceId: named.device.id, entry: hit.entry, phrase },
        own: hit.score,
        range: rangeIn(phrase, tokens, named.name),
        parent,
      };
    });
}

function contextOf(deviceId: string, catalogue: SearchCatalogue): string {
  const entry = catalogue.entries.get(deviceKey(deviceId));
  return entry === undefined
    ? ''
    : [entry.title, entry.detail, ...entry.keywords].join(' ').toLowerCase();
}

function narrows(hit: EntryHit, context: string, tokens: readonly string[]): boolean {
  const title = hit.entry.title.toLowerCase();
  const extra = hit.entry.keywords.join(' ').toLowerCase();
  return tokens.some(
    (token) => tokenScore(token, title, extra) > LOOSE && tokenScore(token, context, '') <= LOOSE,
  );
}

export function addsToDevice(
  hit: EntryHit,
  tokens: readonly string[],
  catalogue: SearchCatalogue,
): boolean {
  const deviceId = hit.entry.group === 'device' ? null : deviceIdOf(hit.entry);
  return deviceId === null || narrows(hit, contextOf(deviceId, catalogue), tokens);
}

export function commandDrafts(
  hits: readonly EntryHit[],
  tokens: readonly string[],
  catalogue: SearchCatalogue,
): Draft[] {
  const grouped = new Map<string, CapabilityHits>();
  for (const hit of hits) {
    const run = hit.entry.run;
    const named = run?.kind === 'command' ? catalogue.devices.get(run.deviceId) : undefined;
    if (run?.kind === 'command' && named !== undefined) {
      const key = capabilityKey(run.deviceId, run.capability);
      const found = grouped.get(key) ?? { named, capability: run.capability, hits: [] };
      grouped.set(key, { ...found, hits: [...found.hits, hit] });
    }
  }
  return [...grouped.values()].flatMap((group) => phraseDrafts(group, tokens, catalogue));
}

function quickControls(named: NamedDevice, catalogue: SearchCatalogue): Draft[] {
  return presentDevice(named.device)
    .capabilities.filter(
      (presented) =>
        presented.writable &&
        presented.tier === 'primary' &&
        presented.role !== 'power' &&
        presented.danger.tier === 'none',
    )
    .slice(0, QUICK_ACTIONS)
    .flatMap((presented) => {
      const draft = entryDraft(capabilityKey(named.device.id, presented.key), null, [], catalogue);
      return draft === null ? [] : [{ ...draft, parent: deviceKey(named.device.id) }];
    });
}

export function quickDrafts(named: NamedDevice, catalogue: SearchCatalogue): Draft[] {
  const pages = (catalogue.children.get(deviceKey(named.device.id)) ?? []).flatMap((id) => {
    const draft = entryDraft(id, null, [], catalogue);
    const runnable = draft?.item.kind === 'entry' && draft.item.entry.run?.kind === 'command';
    return draft === null || runnable || draft.item.kind !== 'entry' ? [] : [draft];
  });
  return [...quickControls(named, catalogue), ...pages];
}
