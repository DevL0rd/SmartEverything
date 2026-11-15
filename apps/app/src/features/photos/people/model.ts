import type {
  PhotoAiStatus,
  PhotoBox,
  PhotoGroup,
  PhotoMergeSuggestion,
  PhotoPeople,
} from '@smarteverything/domain';
import { count } from '../../../format/number';
import { compareText, sentenceCase } from '../../../format/text';

export interface PeopleSections {
  readonly strip: readonly PhotoGroup[];
  readonly people: readonly PhotoGroup[];
  readonly pets: readonly PhotoGroup[];
  readonly unsorted: readonly PhotoGroup[];
  readonly hidden: readonly PhotoGroup[];
}

export interface SpeciesChip {
  readonly species: string;
  readonly count: number;
}

export function compareGroups(first: PhotoGroup, second: PhotoGroup): number {
  const named = Number(second.name !== null) - Number(first.name !== null);
  if (named !== 0) return named;
  if (second.count !== first.count) return second.count - first.count;
  return compareText(second.updatedAt, first.updatedAt);
}

function sorted(groups: readonly PhotoGroup[]): readonly PhotoGroup[] {
  return [...groups].sort(compareGroups);
}

export function isUnsorted(group: PhotoGroup): boolean {
  return group.name === null && group.count === 1;
}

export function peopleSectionsOf(
  groups: readonly PhotoGroup[],
  species: string | null,
): PeopleSections {
  const shown = sorted(groups.filter((group) => !group.hidden));
  const sortedOut = shown.filter((group) => !isUnsorted(group));
  return {
    strip: sortedOut.filter((group) => group.kind === 'person' && group.name !== null),
    people: sortedOut.filter((group) => group.kind === 'person'),
    pets: sortedOut.filter(
      (group) => group.kind === 'pet' && (species === null || group.species === species),
    ),
    unsorted: shown.filter(isUnsorted),
    hidden: sorted(groups.filter((group) => group.hidden)),
  };
}

export function speciesChipsOf(groups: readonly PhotoGroup[]): readonly SpeciesChip[] {
  const tally = new Map<string, number>();
  for (const group of groups) {
    if (group.kind !== 'pet' || group.species === null || group.hidden) continue;
    tally.set(group.species, (tally.get(group.species) ?? 0) + 1);
  }
  return [...tally.entries()]
    .map(([name, total]) => ({ species: name, count: total }))
    .sort(
      (first, second) => second.count - first.count || compareText(first.species, second.species),
    );
}

export function groupTitleOf(group: Pick<PhotoGroup, 'name' | 'kind' | 'species'>): string {
  if (group.name !== null) return group.name;
  if (group.kind === 'pet') return sentenceCase(group.species ?? 'pet');
  return 'Add a name';
}

export function photosText(total: number): string {
  return total === 1 ? '1 photo' : `${count(total)} photos`;
}

export function groupLabelOf(group: PhotoGroup): string {
  const title = group.name ?? (group.kind === 'pet' ? groupTitleOf(group) : 'Unnamed person');
  return `${title}, ${photosText(group.count)}`;
}

export interface FaceCrop {
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
}

export const FACE_ROOM = 1.6;

function clampEdge(offset: number, extent: number, size: number): number {
  return Math.min(0, Math.max(size - extent, offset));
}

export function faceCropOf(box: PhotoBox, aspect: number, size: number): FaceCrop {
  const fit = size / (FACE_ROOM * Math.max(box.w, box.h / aspect));
  const width = Math.max(fit, size, size * aspect);
  const height = width / aspect;
  const centreX = (box.x + box.w / 2) * width;
  const centreY = (box.y + box.h / 2) * height;
  return {
    width,
    height,
    left: clampEdge(size / 2 - centreX, width, size),
    top: clampEdge(size / 2 - centreY, height, size),
  };
}

export type PeopleState =
  'loading' | 'offline' | 'error' | 'grouping-off' | 'indexing' | 'grouping' | 'empty' | 'ready';

export interface PeopleStateInput {
  readonly people: PhotoPeople | undefined;
  readonly status: PhotoAiStatus | undefined;
  readonly failed: boolean;
  readonly live: boolean;
}

export function facesLeftOf(status: PhotoAiStatus): number {
  return status.faces.queued;
}

export function peopleStateOf(input: PeopleStateInput): PeopleState {
  const { people, status } = input;
  if (people !== undefined && people.groups.length > 0) return 'ready';
  if (!input.live && people === undefined) return 'offline';
  if (input.failed) return 'error';
  if (people === undefined || status === undefined) return 'loading';
  return scanStateOf(status);
}

function scanStateOf(status: PhotoAiStatus): PeopleState {
  if (!status.faceGrouping) return 'grouping-off';
  if (facesLeftOf(status) > 0) return 'indexing';
  return status.people.faces > status.people.grouped ? 'grouping' : 'empty';
}

export type ScanState = Extract<PeopleState, 'indexing' | 'grouping' | 'empty'>;

const SCAN_STATES: ReadonlySet<PeopleState> = new Set<ScanState>(['indexing', 'grouping', 'empty']);

export function isScanState(state: PeopleState): state is ScanState {
  return SCAN_STATES.has(state);
}

function facesText(total: number): string {
  return total === 1 ? '1 face' : `${count(total)} faces`;
}

export function faceScanTextOf(status: PhotoAiStatus): string {
  return `Analysed ${count(status.faces.done)} of ${photosText(status.total)} · ${facesText(status.people.faces)} found`;
}

export function groupingTextOf(status: PhotoAiStatus): string {
  const waiting = status.people.faces - status.people.grouped;
  return `${facesText(waiting)} found in ${photosText(status.faces.done)} are being sorted into people.`;
}

export interface EmptyReason {
  readonly title: string;
  readonly body: string;
}

export function emptyReasonOf(status: PhotoAiStatus): EmptyReason {
  const { done, failed } = status.faces;
  if (status.total === 0)
    return {
      title: 'No photos yet',
      body: 'When photos reach your library, your home hub looks for faces in them.',
    };
  if (done === 0 && failed === 0)
    return {
      title: 'Waiting for previews',
      body: `Faces are found once the previews of your ${photosText(status.total)} are ready.`,
    };
  if (done === 0)
    return {
      title: 'Face analysis failed',
      body: `Your home hub could not analyse ${photosText(failed)}.`,
    };
  const failures = failed === 0 ? '' : ` Face analysis failed on ${photosText(failed)}.`;
  return {
    title: 'No faces found',
    body: `Your home hub analysed ${photosText(done)} and found no people in them.${failures}`,
  };
}

export function faceProgressOf(status: PhotoAiStatus): number {
  const { done, queued, failed } = status.faces;
  const total = done + queued + failed;
  return total === 0 ? 0 : done / total;
}

export function mergeCandidatesOf(
  suggestions: readonly PhotoMergeSuggestion[],
  groups: readonly PhotoGroup[],
): readonly (readonly [PhotoGroup, PhotoGroup])[] {
  const byId = new Map(groups.map((group) => [group.id, group]));
  return suggestions.flatMap((suggestion) => {
    const first = byId.get(suggestion.groupIds[0]);
    const second = byId.get(suggestion.groupIds[1]);
    if (first === undefined || second === undefined) return [];
    return [
      compareGroups(first, second) <= 0 ? ([first, second] as const) : ([second, first] as const),
    ];
  });
}

export function suggestionKey(suggestion: PhotoMergeSuggestion): string {
  return [...suggestion.groupIds].sort().join('|');
}

export function mergeTargetsOf(
  group: PhotoGroup,
  groups: readonly PhotoGroup[],
): readonly PhotoGroup[] {
  return sorted(
    groups.filter(
      (other) =>
        other.id !== group.id &&
        other.kind === group.kind &&
        (group.kind === 'person' || other.species === group.species),
    ),
  );
}

export function nameDraftOf(raw: string): string | null {
  const name = raw.trim();
  return name === '' ? null : name;
}

export function peopleSubtitleOf(people: PhotoPeople | undefined): string | null {
  if (people === undefined) return null;
  const persons = people.groups.filter((group) => group.kind === 'person' && !group.hidden).length;
  const pets = people.groups.filter((group) => group.kind === 'pet' && !group.hidden).length;
  const parts = [
    persons === 0 ? null : `${count(persons)} ${persons === 1 ? 'person' : 'people'}`,
    pets === 0 ? null : `${count(pets)} ${pets === 1 ? 'pet' : 'pets'}`,
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : parts.join(' · ');
}

export interface Naming {
  readonly people: number;
  readonly pets: number;
  readonly total: number;
}

export function namingOf(groups: readonly PhotoGroup[]): Naming {
  const sorted = groups.filter((group) => !group.hidden && !isUnsorted(group));
  const named = (kind: PhotoGroup['kind']): number =>
    sorted.filter((group) => group.kind === kind && group.name !== null).length;
  return { people: named('person'), pets: named('pet'), total: sorted.length };
}

export function namingLineOf(naming: Naming): string {
  const named = naming.people + naming.pets;
  if (naming.total === 0) return 'People and pets';
  if (named === naming.total) return `All ${count(naming.total)} named`;
  return `${count(named)} of ${count(naming.total)} named`;
}

export function pairLineOf(first: PhotoGroup, second: PhotoGroup): string {
  const names = [first.name, second.name].filter((name): name is string => name !== null);
  if (names.length === 0)
    return first.kind === 'pet' ? 'These two pets look alike' : 'These two people look alike';
  if (names.length === 1) return `${names[0] ?? ''} and an unnamed group look alike`;
  return `${names.join(' and ')} look alike`;
}
