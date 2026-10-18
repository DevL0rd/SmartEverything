import { numberPresets } from '@smarteverything/domain';
import type { SearchCatalogue } from './catalogue';
import { leafOf, type ResultNode } from './nodes';
import { treeOf } from './tree';

const TRIES = 3;

function powerTry(catalogue: SearchCatalogue): string | null {
  const entry = catalogue.index.entries.find(
    (candidate) => candidate.group === 'device' && candidate.run?.kind === 'command',
  );
  const named =
    entry !== undefined && 'deviceId' in entry.open
      ? catalogue.devices.get(entry.open.deviceId)
      : undefined;
  return named === undefined ? null : `turn on ${named.name.toLowerCase()}`;
}

function numberTry(catalogue: SearchCatalogue): string | null {
  const [template] = catalogue.index.numbers;
  if (template === undefined) {
    return null;
  }
  const presets = numberPresets(template.descriptor);
  const middle = presets[Math.floor(presets.length / 2)];
  return middle === undefined
    ? null
    : `${template.presented.label.toLowerCase()} ${String(middle)}`;
}

function roomTry(catalogue: SearchCatalogue): string | null {
  const room = catalogue.index.entries.find((entry) => entry.group === 'room');
  return room === undefined ? null : room.title.toLowerCase();
}

const tried = new WeakMap<SearchCatalogue, readonly string[]>();

export function triesOf(catalogue: SearchCatalogue): readonly string[] {
  const known = tried.get(catalogue);
  if (known !== undefined) {
    return known;
  }
  const tries = [powerTry(catalogue), numberTry(catalogue), roomTry(catalogue)]
    .filter((query): query is string => query !== null)
    .filter((query) => treeOf(catalogue, query).length > 0)
    .slice(0, TRIES);
  tried.set(catalogue, tries);
  return tries;
}

export function favouritesOf(catalogue: SearchCatalogue): readonly ResultNode[] {
  return catalogue.index.entries
    .filter((entry) => entry.group === 'device' && entry.suggested)
    .map((entry) => leafOf(entry, catalogue));
}

export function roomsOf(catalogue: SearchCatalogue): readonly ResultNode[] {
  return catalogue.index.entries
    .filter((entry) => entry.group === 'room')
    .map((entry) => leafOf(entry, catalogue));
}
