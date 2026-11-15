import type { PhotoAnalysisRow } from '../../store/repositories/photo-analysis';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export interface DescribedPhoto {
  readonly analysis: Pick<PhotoAnalysisRow, 'caption' | 'scene' | 'labels' | 'pets'>;
  readonly takenAt: string | null;
  readonly place: string | null;
}

function takenWords(takenAt: string | null): string | null {
  if (takenAt === null) return null;
  const moment = new Date(takenAt);
  const month = MONTHS[moment.getUTCMonth()];
  return month === undefined ? null : `${month} ${String(moment.getUTCFullYear())}`;
}

export function describePhoto(photo: DescribedPhoto): string {
  const { analysis } = photo;
  const species = [...new Set(analysis.pets.map((pet) => pet.species))];
  const parts = [
    analysis.caption,
    analysis.scene === null ? null : `Scene: ${analysis.scene}.`,
    analysis.labels.length === 0 ? null : `Contains: ${analysis.labels.join(', ')}.`,
    species.length === 0 ? null : `Pets: ${species.join(', ')}.`,
    photo.place === null ? null : `Place: ${photo.place}.`,
    takenWords(photo.takenAt),
  ];
  return parts.filter((part) => part !== null).join(' ');
}

export function searchWords(
  analysis: Pick<PhotoAnalysisRow, 'scene' | 'labels' | 'pets'>,
): readonly string[] {
  return [
    ...(analysis.scene === null ? [] : [analysis.scene]),
    ...analysis.labels,
    ...analysis.pets.map((pet) => pet.species),
  ];
}
