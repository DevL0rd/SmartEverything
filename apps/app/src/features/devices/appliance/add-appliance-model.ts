import type { IrLibraryModel } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import { CATEGORY_LOOKS, categoryOfLearned } from '../remote/remote-category';

export const ADD_APPLIANCE_PAGE = 'add-appliance';

const NAME_MOST = 80;

export interface LibraryPath {
  readonly category: string | null;
  readonly brand: string | null;
  readonly model: IrLibraryModel | null;
}

export const EMPTY_PATH: LibraryPath = { category: null, brand: null, model: null };

export function matching<T>(
  items: readonly T[],
  query: string,
  words: (item: T) => readonly string[],
): readonly T[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') {
    return items;
  }
  return items.filter((item) => words(item).some((word) => word.toLowerCase().includes(needle)));
}

export function modelWords(model: IrLibraryModel): readonly string[] {
  return [...model.models, ...model.buttons];
}

const LIBRARY_ICONS: Readonly<Record<string, IconName>> = {
  'air purifier': 'airVent',
  camera: 'camera',
  cctv: 'cameras',
  clock: 'clock',
  computer: 'cpu',
  console: 'gamepad',
  'cd player': 'music',
  'dvd player': 'film',
  'blu-ray player': 'film',
  fireplace: 'flame',
  heater: 'heater',
  humidifier: 'droplet',
  'media player': 'film',
  monitor: 'monitor',
  'picture frame': 'image',
  toy: 'puzzle',
  'vacuum cleaner': 'vacuum',
};

export function categoryIcon(category: string): IconName {
  const known = categoryOfLearned(category);
  return known === 'other'
    ? (LIBRARY_ICONS[category.trim().toLowerCase()] ?? CATEGORY_LOOKS.other.icon)
    : CATEGORY_LOOKS[known].icon;
}

function inSentence(category: string): string {
  return category
    .split(' ')
    .map((word) => (word.slice(1) === word.slice(1).toLowerCase() ? word.toLowerCase() : word))
    .join(' ');
}

export function opensAfterCreate(category: string): boolean {
  return categoryOfLearned(category) === 'ac';
}

export function defaultName(brand: string, category: string): string {
  return `${brand} ${inSentence(category)}`;
}

export function nameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === '') {
    return 'Give it a name';
  }
  return trimmed.length > NAME_MOST ? `Use at most ${String(NAME_MOST)} characters` : null;
}

function buttonCount(count: number): string {
  return count === 1 ? '1 button' : `${String(count)} buttons`;
}

export function modelTitle(model: IrLibraryModel): string {
  return model.models.join(', ');
}

export function modelSubtitle(model: IrLibraryModel): string {
  return model.kind === 'climate'
    ? 'Full control: power, mode, temperature and fan in one go'
    : buttonCount(model.buttons.length);
}

export function countLabel(models: number): string {
  return models === 1 ? '1 model' : `${String(models)} models`;
}
