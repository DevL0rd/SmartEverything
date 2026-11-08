import type { ColourRole } from '../../../design/tokens';
import { count } from '../../../format/number';
import { compareText } from '../../../format/text';
import { deleterName, type Deleter, type TrashItem } from './trash-model';

export interface PersonTone {
  readonly colour: ColourRole;
  readonly toward: ColourRole | null;
  readonly share: number;
}

export interface DeletedByShare {
  readonly key: string;
  readonly label: string;
  readonly count: number;
  readonly tone: PersonTone;
}

const YOU_TONE: PersonTone = { colour: 'viz-blue', toward: null, share: 1 };
export const UNKNOWN_TONE: PersonTone = { colour: 'on-surface-faint', toward: null, share: 1 };
const PERSON_COLOUR: ColourRole = 'viz-magenta';
const STEP_SHARE = 0.55;

export function personToneOf(position: number): PersonTone {
  if (position === 0) return { colour: PERSON_COLOUR, toward: null, share: 1 };
  const step = Math.ceil(position / 2);
  return {
    colour: PERSON_COLOUR,
    toward: position % 2 === 1 ? 'on-surface' : 'bg',
    share: STEP_SHARE ** step,
  };
}

export function deleterKey(deleter: Deleter): string {
  return deleter.kind === 'person' ? `person:${deleter.id}` : deleter.kind;
}

interface Tally {
  readonly deleter: Deleter;
  readonly count: number;
}

function talliesOf(items: readonly TrashItem[]): readonly Tally[] {
  const tallies = new Map<string, Tally>();
  for (const item of items) {
    const key = deleterKey(item.deleter);
    tallies.set(key, { deleter: item.deleter, count: (tallies.get(key)?.count ?? 0) + 1 });
  }
  return [...tallies.values()];
}

function byCount(left: Tally, right: Tally): number {
  return (
    right.count - left.count || compareText(deleterName(left.deleter), deleterName(right.deleter))
  );
}

export function deletedByOf(items: readonly TrashItem[]): readonly DeletedByShare[] {
  const tallies = talliesOf(items);
  const you = tallies.filter((tally) => tally.deleter.kind === 'you');
  const people = tallies.filter((tally) => tally.deleter.kind === 'person').sort(byCount);
  const unknown = tallies.filter((tally) => tally.deleter.kind === 'unknown');
  const share = (tally: Tally, tone: PersonTone): DeletedByShare => ({
    key: deleterKey(tally.deleter),
    label: deleterName(tally.deleter),
    count: tally.count,
    tone,
  });
  return [
    ...you.map((tally) => share(tally, YOU_TONE)),
    ...people.map((tally, position) => share(tally, personToneOf(position))),
    ...unknown.map((tally) => share(tally, UNKNOWN_TONE)),
  ];
}

export function deletedByLabel(shares: readonly DeletedByShare[]): string {
  const parts = shares.map((each) => `${each.label} ${count(each.count)}`);
  return `Deleted by: ${parts.join(', ')}`;
}
